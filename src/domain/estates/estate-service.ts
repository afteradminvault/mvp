import type {
  CreateDraftCaseInput,
  CreateEstateInput,
  Estate,
  EstateRepository,
  Jurisdiction,
  SaveDraftProgressInput,
  UpdateEstateInput,
} from "./ports";

// Bounds are a business rule, not just UI hinting: too short an interval
// makes the dead-man's-switch prone to false positives from someone briefly
// unreachable (docs/SECURITY_ARCHITECTURE.md §4.3); too long makes it a
// meaningless backstop. Same reasoning for grace period vs. the self-cancel
// window discussed in §4.2.
export const MIN_CHECK_IN_INTERVAL_DAYS = 30;
export const MAX_CHECK_IN_INTERVAL_DAYS = 365;
export const MIN_GRACE_PERIOD_DAYS = 7;
export const MAX_GRACE_PERIOD_DAYS = 90;
export const MAX_DISPLAY_NAME_LENGTH = 200;
export const MAX_DECEASED_FULL_NAME_LENGTH = 200;
export const MAX_DECEASED_RELATIONSHIP_LENGTH = 100;
export const MAX_DRAFT_STEP_LENGTH = 100;

export class InvalidEstateInputError extends Error {}
export class EstateNotFoundError extends Error {}

function validateBoundedText(value: unknown, fieldName: string, maxLength: number): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidEstateInputError(`${fieldName} is required.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new InvalidEstateInputError(`${fieldName} must be ${maxLength} characters or fewer.`);
  }
  return trimmed;
}

/** DOB/DOD are plain dates (YYYY-MM-DD, from an <input type="date">), not timestamps — never in the future, since both describe things that have already happened by definition. */
function validatePastDate(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new InvalidEstateInputError(`${fieldName} must be a valid date (YYYY-MM-DD).`);
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new InvalidEstateInputError(`${fieldName} must be a valid date (YYYY-MM-DD).`);
  }
  if (parsed.getTime() > Date.now()) {
    throw new InvalidEstateInputError(`${fieldName} cannot be in the future.`);
  }
  return value;
}

function validateDisplayName(displayName: string): string {
  const trimmed = displayName.trim();
  if (trimmed.length === 0) {
    throw new InvalidEstateInputError("Estate display name is required.");
  }
  if (trimmed.length > MAX_DISPLAY_NAME_LENGTH) {
    throw new InvalidEstateInputError(
      `Estate display name must be ${MAX_DISPLAY_NAME_LENGTH} characters or fewer.`,
    );
  }
  return trimmed;
}

function validateCheckInIntervalDays(days: number): number {
  if (!Number.isInteger(days) || days < MIN_CHECK_IN_INTERVAL_DAYS || days > MAX_CHECK_IN_INTERVAL_DAYS) {
    throw new InvalidEstateInputError(
      `Check-in interval must be a whole number of days between ${MIN_CHECK_IN_INTERVAL_DAYS} and ${MAX_CHECK_IN_INTERVAL_DAYS}.`,
    );
  }
  return days;
}

function validateGracePeriodDays(days: number): number {
  if (!Number.isInteger(days) || days < MIN_GRACE_PERIOD_DAYS || days > MAX_GRACE_PERIOD_DAYS) {
    throw new InvalidEstateInputError(
      `Grace period must be a whole number of days between ${MIN_GRACE_PERIOD_DAYS} and ${MAX_GRACE_PERIOD_DAYS}.`,
    );
  }
  return days;
}

/**
 * Orchestrates estate use cases and owns the validation/business rules
 * around them. No Supabase, no Next.js — see ports.ts.
 */
export class EstateService {
  constructor(private readonly repository: EstateRepository) {}

  async createEstate(input: CreateEstateInput): Promise<Estate> {
    const displayName = validateDisplayName(input.displayName);
    const jurisdictionId = input.jurisdictionId.trim();
    if (jurisdictionId.length === 0) {
      throw new InvalidEstateInputError("A jurisdiction must be selected.");
    }
    const checkInIntervalDays =
      input.checkInIntervalDays === undefined
        ? undefined
        : validateCheckInIntervalDays(input.checkInIntervalDays);

    return this.repository.createEstate({ displayName, jurisdictionId, checkInIntervalDays });
  }

  async getEstate(estateId: string): Promise<Estate> {
    const estate = await this.repository.getEstate(estateId);
    if (!estate) {
      throw new EstateNotFoundError("Estate not found, or you don't have access to it.");
    }
    return estate;
  }

  async updateEstate(estateId: string, input: UpdateEstateInput): Promise<Estate> {
    const patch: UpdateEstateInput = {};
    if (input.displayName !== undefined) {
      patch.displayName = validateDisplayName(input.displayName);
    }
    if (input.checkInIntervalDays !== undefined) {
      patch.checkInIntervalDays = validateCheckInIntervalDays(input.checkInIntervalDays);
    }
    if (input.gracePeriodDays !== undefined) {
      patch.gracePeriodDays = validateGracePeriodDays(input.gracePeriodDays);
    }

    if (Object.keys(patch).length === 0) {
      throw new InvalidEstateInputError("No valid fields to update.");
    }

    return this.repository.updateEstate(estateId, patch);
  }

  /**
   * The dead-man's-switch heartbeat (docs/API_SPECIFICATION.md §2). Only
   * valid in the two "nothing unusual is happening" states — the
   * checkin_overdue → death_reported → verifying progression involves the
   * death-verification workflow (Milestone 2, not built yet), and a plain
   * check-in must not be able to silently short-circuit that once it
   * exists. Rejecting now, in those states, is the correct behavior both
   * today and once that workflow lands.
   */
  async checkIn(estateId: string): Promise<Estate> {
    const estate = await this.getEstate(estateId);
    if (estate.status !== "setup" && estate.status !== "active_living") {
      throw new InvalidEstateInputError(
        `Cannot check in while estate status is "${estate.status}". That status change goes through the death-verification workflow, not a check-in.`,
      );
    }
    return this.repository.recordCheckIn(estateId);
  }

  async listMyEstates(): Promise<Estate[]> {
    return this.repository.listMyEstates();
  }

  async listSupportedJurisdictions(): Promise<Jurisdiction[]> {
    return this.repository.listSupportedJurisdictions();
  }

  /**
   * The onboarding entry point (PRD v2 §3.2, US-2.1) — creates a case in
   * 'draft' status. date_of_death is the only optional deceased-profile
   * field: blank means pre-death/planning-ahead, filled in means
   * post-death (PRD v2 §0) — same form either way, per the resolved
   * "one unified flow, copy adapts" decision.
   */
  async createDraftCase(input: CreateDraftCaseInput): Promise<Estate> {
    const jurisdictionId = input.jurisdictionId.trim();
    if (jurisdictionId.length === 0) {
      throw new InvalidEstateInputError("A jurisdiction must be selected.");
    }
    const deceasedFullName = validateBoundedText(
      input.deceasedFullName,
      "Deceased's full name",
      MAX_DECEASED_FULL_NAME_LENGTH,
    );
    const deceasedDateOfBirth = validatePastDate(input.deceasedDateOfBirth, "Date of birth");
    const deceasedRelationship = validateBoundedText(
      input.deceasedRelationship,
      "Relationship",
      MAX_DECEASED_RELATIONSHIP_LENGTH,
    );
    const deceasedDateOfDeath =
      input.deceasedDateOfDeath === undefined || input.deceasedDateOfDeath === null
        ? null
        : validatePastDate(input.deceasedDateOfDeath, "Date of death");
    if (deceasedDateOfDeath !== null && deceasedDateOfDeath < deceasedDateOfBirth) {
      throw new InvalidEstateInputError("Date of death cannot be before date of birth.");
    }
    const checkInIntervalDays =
      input.checkInIntervalDays === undefined
        ? undefined
        : validateCheckInIntervalDays(input.checkInIntervalDays);

    return this.repository.createDraftCase({
      jurisdictionId,
      deceasedFullName,
      deceasedDateOfBirth,
      deceasedRelationship,
      deceasedDateOfDeath,
      checkInIntervalDays,
    });
  }

  /**
   * Merges the given fields into the existing draft_payload rather than
   * replacing it wholesale — each onboarding step submits only its own
   * slice (Database Schema v2 §2.3), and a later step's save must not
   * erase an earlier step's answers.
   */
  async saveDraftProgress(estateId: string, input: SaveDraftProgressInput): Promise<Estate> {
    const draftStep = validateBoundedText(input.draftStep, "draftStep", MAX_DRAFT_STEP_LENGTH);
    if (typeof input.draftPayload !== "object" || input.draftPayload === null || Array.isArray(input.draftPayload)) {
      throw new InvalidEstateInputError("draftPayload must be an object.");
    }

    const existing = await this.getEstate(estateId);
    if (existing.status !== "draft") {
      throw new InvalidEstateInputError("Onboarding has already been completed for this case.");
    }

    const mergedPayload = { ...existing.draftPayload, ...input.draftPayload };
    return this.repository.saveDraftProgress(estateId, { draftStep, draftPayload: mergedPayload });
  }

  /** Completes onboarding — the only path from 'draft' to 'active_living' (activate_draft_case()). */
  async activateDraftCase(estateId: string): Promise<Estate> {
    const existing = await this.getEstate(estateId);
    if (existing.status !== "draft") {
      throw new InvalidEstateInputError("This case is not in draft status.");
    }
    return this.repository.activateDraftCase(estateId);
  }
}
