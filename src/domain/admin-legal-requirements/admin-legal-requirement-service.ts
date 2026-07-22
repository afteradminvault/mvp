import { ASSET_CATEGORIES } from "@/domain/assets/asset-service";
import type { AssetCategory } from "@/domain/assets/ports";
import type {
  LegalRequirement,
  LegalRequirementContentInput,
  LegalRequirementRepository,
  ListLegalRequirementsFilter,
  RequirementType,
  SubmissionChannel,
} from "./ports";

export const REQUIREMENT_TYPES: readonly RequirementType[] = [
  "death_certificate_certified",
  "death_certificate_copy",
  "letters_testamentary",
  "letters_of_administration",
  "small_estate_affidavit",
  "executor_government_id",
  "notarization",
  "court_order",
  "provider_specific_form",
];

export const SUBMISSION_CHANNELS: readonly SubmissionChannel[] = ["online_form", "mail", "in_person", "api"];

export const MAX_TEXT_FIELD_LENGTH = 2000;

export class InvalidLegalRequirementInputError extends Error {}
export class LegalRequirementForbiddenError extends Error {}
export class LegalRequirementNotFoundError extends Error {}
export class LegalRequirementAlreadySupersededError extends Error {}

function validateId(id: unknown, fieldName: string): string {
  if (typeof id !== "string" || id.trim().length === 0) {
    throw new InvalidLegalRequirementInputError(`${fieldName} is required.`);
  }
  return id;
}

function validateAssetCategory(value: unknown): AssetCategory {
  if (typeof value !== "string" || !ASSET_CATEGORIES.includes(value as AssetCategory)) {
    throw new InvalidLegalRequirementInputError(`assetCategory must be one of: ${ASSET_CATEGORIES.join(", ")}.`);
  }
  return value as AssetCategory;
}

function validateRequirementType(value: unknown): RequirementType {
  if (typeof value !== "string" || !REQUIREMENT_TYPES.includes(value as RequirementType)) {
    throw new InvalidLegalRequirementInputError(`requirementType must be one of: ${REQUIREMENT_TYPES.join(", ")}.`);
  }
  return value as RequirementType;
}

function validateSubmissionChannel(value: unknown): SubmissionChannel {
  if (typeof value !== "string" || !SUBMISSION_CHANNELS.includes(value as SubmissionChannel)) {
    throw new InvalidLegalRequirementInputError(
      `submissionChannel must be one of: ${SUBMISSION_CHANNELS.join(", ")}.`,
    );
  }
  return value as SubmissionChannel;
}

function validateOptionalText(value: unknown, fieldName: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new InvalidLegalRequirementInputError(`${fieldName} must be a string.`);
  }
  if (value.length > MAX_TEXT_FIELD_LENGTH) {
    throw new InvalidLegalRequirementInputError(`${fieldName} must be ${MAX_TEXT_FIELD_LENGTH} characters or fewer.`);
  }
  return value;
}

function validateDisplayOrder(value: unknown): number {
  if (value === undefined) return 0;
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new InvalidLegalRequirementInputError("displayOrder must be a non-negative integer.");
  }
  return value as number;
}

function validateContent(input: LegalRequirementContentInput): LegalRequirementContentInput {
  return {
    jurisdictionId: validateId(input.jurisdictionId, "jurisdictionId"),
    assetCategory: validateAssetCategory(input.assetCategory),
    providerId: input.providerId ?? null,
    requirementType: validateRequirementType(input.requirementType),
    submissionChannel: validateSubmissionChannel(input.submissionChannel),
    submissionDetail: validateOptionalText(input.submissionDetail, "submissionDetail"),
    displayOrder: validateDisplayOrder(input.displayOrder),
    notes: validateOptionalText(input.notes, "notes"),
    pendingCounselReview: input.pendingCounselReview ?? false,
  };
}

function translateRepositoryError(error: unknown): never {
  // Real Postgres RLS WITH CHECK violation text (legal_requirements_admin_write)
  // — defense-in-depth fallback; requirePlatformAdmin() at the route layer
  // is the primary gate.
  if (error instanceof Error && /row-level security|permission denied/i.test(error.message)) {
    throw new LegalRequirementForbiddenError("Only platform admins can manage legal requirements.");
  }
  throw error;
}

/**
 * Orchestrates the legal_requirements content model (Legal & Compliance
 * §1.3's "entire reason the legal domain doesn't get hardcoded into
 * application logic"). Edits never mutate an existing row's content —
 * reviseRequirement always creates a new row and links the old one to it
 * via supersededById, per Database Schema §3.2's versioning design (so
 * account_closure_requests.legal_requirement_snapshot stays reconstructable
 * even after content changes).
 */
export class AdminLegalRequirementService {
  constructor(private readonly repository: LegalRequirementRepository) {}

  async createRequirement(input: LegalRequirementContentInput): Promise<LegalRequirement> {
    const validated = validateContent(input);
    try {
      return await this.repository.createRequirement(validated);
    } catch (error) {
      translateRepositoryError(error);
    }
  }

  async listRequirements(filter?: ListLegalRequirementsFilter): Promise<LegalRequirement[]> {
    if (filter?.assetCategory !== undefined) {
      validateAssetCategory(filter.assetCategory);
    }
    try {
      return await this.repository.listRequirements(filter);
    } catch (error) {
      translateRepositoryError(error);
    }
  }

  async reviseRequirement(existingId: string, input: LegalRequirementContentInput): Promise<LegalRequirement> {
    const validated = validateContent(input);

    let existing;
    try {
      existing = await this.repository.getRequirement(existingId);
    } catch (error) {
      translateRepositoryError(error);
    }
    if (!existing) {
      throw new LegalRequirementNotFoundError("Legal requirement not found.");
    }
    if (existing.supersededById) {
      throw new LegalRequirementAlreadySupersededError(
        "This version has already been superseded — revise the current version instead.",
      );
    }

    try {
      return await this.repository.reviseRequirement(existingId, validated);
    } catch (error) {
      translateRepositoryError(error);
    }
  }
}
