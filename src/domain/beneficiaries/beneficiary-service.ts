import type { DigitalAssetRepository } from "@/domain/assets/ports";
import type {
  Beneficiary,
  BeneficiaryRepository,
  CreateBeneficiaryInput,
  UpdateBeneficiaryInput,
} from "./ports";

export const MAX_DISPLAY_NAME_LENGTH = 200;
export const MAX_RELATIONSHIP_LENGTH = 100;
export const MAX_NOTES_LENGTH = 2000;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class InvalidBeneficiaryInputError extends Error {}
export class BeneficiaryNotFoundError extends Error {}
export class BeneficiaryForbiddenError extends Error {}

function validateBoundedText(value: string, fieldName: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new InvalidBeneficiaryInputError(`${fieldName} cannot be blank if provided.`);
  }
  if (trimmed.length > maxLength) {
    throw new InvalidBeneficiaryInputError(`${fieldName} must be ${maxLength} characters or fewer.`);
  }
  return trimmed;
}

function validateDisplayName(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidBeneficiaryInputError("displayName is required.");
  }
  return validateBoundedText(value, "displayName", MAX_DISPLAY_NAME_LENGTH);
}

function validateNullableBoundedText(value: unknown, fieldName: string, maxLength: number): string | null {
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new InvalidBeneficiaryInputError(`${fieldName} must be a string, or null to clear it.`);
  }
  return validateBoundedText(value, fieldName, maxLength);
}

function validateContactEmail(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !EMAIL_PATTERN.test(value.trim())) {
    throw new InvalidBeneficiaryInputError("contactEmail must be a valid email address, or null to clear it.");
  }
  return value.trim();
}

/** Every RLS-backed write in this domain raises a plain Postgres exception; this maps it once, in one place. */
function translateRepositoryError(error: unknown): never {
  if (error instanceof Error && /row-level security|permission denied/i.test(error.message)) {
    throw new BeneficiaryForbiddenError("Only the estate owner can manage beneficiaries.");
  }
  throw error;
}

/**
 * Orchestrates beneficiary CRUD (Database Schema §4.3, API Specification
 * §7). Authorization is entirely RLS-backed (beneficiaries_select_member /
 * beneficiaries_write_owner, already in place from the initial schema
 * migration — no new migration needed for this feature); this service
 * validates input and, when a beneficiary is tied to a specific asset
 * (digitalAssetId non-null), verifies that asset actually belongs to the
 * same estate — a check RLS can't express since it has no visibility into
 * the *caller's* claimed estate, only the row's own.
 */
export class BeneficiaryService {
  constructor(
    private readonly repository: BeneficiaryRepository,
    private readonly assetRepository: DigitalAssetRepository,
  ) {}

  private async validateDigitalAssetId(estateId: string, value: unknown): Promise<string | null> {
    if (value === null) return null;
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new InvalidBeneficiaryInputError(
        "digitalAssetId must be a non-empty string, or null for an estate-wide beneficiary.",
      );
    }
    const asset = await this.assetRepository.getAsset(value.trim());
    if (!asset || asset.estateId !== estateId) {
      throw new InvalidBeneficiaryInputError("digitalAssetId must reference an asset in this estate.");
    }
    return asset.id;
  }

  async createBeneficiary(
    estateId: string,
    input: {
      digitalAssetId?: unknown;
      displayName?: unknown;
      relationship?: unknown;
      contactEmail?: unknown;
      notes?: unknown;
    },
  ): Promise<Beneficiary> {
    const displayName = validateDisplayName(input.displayName);
    const digitalAssetId = await this.validateDigitalAssetId(estateId, input.digitalAssetId ?? null);
    const relationship = validateNullableBoundedText(
      input.relationship ?? null,
      "relationship",
      MAX_RELATIONSHIP_LENGTH,
    );
    const contactEmail = validateContactEmail(input.contactEmail ?? null);
    const notes = validateNullableBoundedText(input.notes ?? null, "notes", MAX_NOTES_LENGTH);

    const payload: CreateBeneficiaryInput = { digitalAssetId, displayName, relationship, contactEmail, notes };
    try {
      return await this.repository.createBeneficiary(estateId, payload);
    } catch (error) {
      translateRepositoryError(error);
    }
  }

  async getBeneficiary(beneficiaryId: string): Promise<Beneficiary> {
    const beneficiary = await this.repository.getBeneficiary(beneficiaryId);
    if (!beneficiary) {
      throw new BeneficiaryNotFoundError("Beneficiary not found, or you don't have access to it.");
    }
    return beneficiary;
  }

  async updateBeneficiary(
    estateId: string,
    beneficiaryId: string,
    input: {
      digitalAssetId?: unknown;
      displayName?: unknown;
      relationship?: unknown;
      contactEmail?: unknown;
      notes?: unknown;
    },
  ): Promise<Beneficiary> {
    const patch: UpdateBeneficiaryInput = {};
    if (input.displayName !== undefined) {
      patch.displayName = validateDisplayName(input.displayName);
    }
    if (input.digitalAssetId !== undefined) {
      patch.digitalAssetId = await this.validateDigitalAssetId(estateId, input.digitalAssetId);
    }
    if (input.relationship !== undefined) {
      patch.relationship = validateNullableBoundedText(input.relationship, "relationship", MAX_RELATIONSHIP_LENGTH);
    }
    if (input.contactEmail !== undefined) {
      patch.contactEmail = validateContactEmail(input.contactEmail);
    }
    if (input.notes !== undefined) {
      patch.notes = validateNullableBoundedText(input.notes, "notes", MAX_NOTES_LENGTH);
    }

    if (Object.keys(patch).length === 0) {
      throw new InvalidBeneficiaryInputError("No valid fields to update.");
    }

    try {
      return await this.repository.updateBeneficiary(beneficiaryId, patch);
    } catch (error) {
      translateRepositoryError(error);
    }
  }

  async deleteBeneficiary(beneficiaryId: string): Promise<void> {
    try {
      await this.repository.deleteBeneficiary(beneficiaryId);
    } catch (error) {
      translateRepositoryError(error);
    }
  }

  async listBeneficiaries(estateId: string): Promise<Beneficiary[]> {
    return this.repository.listBeneficiaries(estateId);
  }
}
