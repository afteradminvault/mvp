import type {
  CreateEstateInput,
  Estate,
  EstateRepository,
  Jurisdiction,
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

export class InvalidEstateInputError extends Error {}
export class EstateNotFoundError extends Error {}

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
}
