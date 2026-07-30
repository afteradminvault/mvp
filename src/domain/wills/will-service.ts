import type { Estate, EstateRepository, EstateStatus } from "@/domain/estates/ports";
import type { DigitalAssetRepository } from "@/domain/assets/ports";
import type { BeneficiaryRepository } from "@/domain/beneficiaries/ports";
import type { DocumentRepository } from "@/domain/documents/ports";
import type { WillExecutionRequirementRepository } from "@/domain/admin-will-execution-requirements/ports";
import { renderWillContent } from "@/infrastructure/wills/render-will-content";
import { generateWillPdf } from "@/infrastructure/wills/generate-will-pdf";
import type {
  BequestCategory,
  CreateBequestInput,
  UpdateBequestInput,
  UpdateGuardianInfoInput,
  Will,
  WillBequest,
  WillRepository,
} from "./ports";

export const BEQUEST_CATEGORIES: readonly BequestCategory[] = [
  "real_property",
  "financial_account",
  "business_interest",
  "personal_property",
  "digital_asset",
  "vehicle",
  "other",
];

/** A will can only be created/edited while the testator is still living, per this Case's own status lifecycle — nothing about a will makes sense once death has been reported. */
const LIVING_STATUSES: readonly EstateStatus[] = ["draft", "active_living", "checkin_overdue"];

export const MAX_TEXT_FIELD_LENGTH = 2000;
export const MAX_DESCRIPTION_LENGTH = 1000;

export class InvalidWillInputError extends Error {}
export class WillNotFoundError extends Error {}
export class WillForbiddenError extends Error {}
export class WillAlreadyFinalizedError extends Error {}
export class WillBequestNotFoundError extends Error {}

function validateOptionalText(value: unknown, fieldName: string, maxLength = MAX_TEXT_FIELD_LENGTH): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new InvalidWillInputError(`${fieldName} must be a string.`);
  }
  if (value.length > maxLength) {
    throw new InvalidWillInputError(`${fieldName} must be ${maxLength} characters or fewer.`);
  }
  return value;
}

function validateBequestCategory(value: unknown): BequestCategory {
  if (typeof value !== "string" || !BEQUEST_CATEGORIES.includes(value as BequestCategory)) {
    throw new InvalidWillInputError(`bequestCategory must be one of: ${BEQUEST_CATEGORIES.join(", ")}.`);
  }
  return value as BequestCategory;
}

function requireLinkOrDescription(
  digitalAssetId: string | null,
  beneficiaryId: string | null,
  description: string | null,
): void {
  if (!digitalAssetId && !beneficiaryId && !description) {
    throw new InvalidWillInputError(
      "A bequest needs either a linked account/beneficiary or a text description.",
    );
  }
}

/** Every RLS-backed write in this domain raises a plain Postgres exception; this maps it once, in one place. */
function translateRepositoryError(error: unknown): never {
  if (error instanceof Error && /row-level security|permission denied/i.test(error.message)) {
    throw new WillForbiddenError("Only the testator can manage this will.");
  }
  throw error;
}

function requireSelfPlannedLivingCase(estate: Estate): void {
  if (!estate.isSelfPlanned) {
    throw new InvalidWillInputError("A will can only be created for a self-planned Case.");
  }
  if (!LIVING_STATUSES.includes(estate.status)) {
    throw new InvalidWillInputError(`A will cannot be created or edited once the Case has moved past status "${estate.status}".`);
  }
}

/**
 * Orchestrates the Will Builder (guardian nomination, bequests, residuary
 * clause, and document generation). Executor + alternate are never stored
 * here — WillRepository.listExecutors reads case_members (role='executor',
 * ordered by fallback_order) live, so nominating/changing an executor via
 * the existing membership invite flow is automatically reflected the next
 * time the will is generated. Testator identity/DOB/jurisdiction are read
 * live from the parent Case for the same reason.
 */
export class WillService {
  constructor(
    private readonly repository: WillRepository,
    private readonly estateRepository: EstateRepository,
    private readonly executionRequirementRepository: WillExecutionRequirementRepository,
    private readonly digitalAssetRepository: DigitalAssetRepository,
    private readonly beneficiaryRepository: BeneficiaryRepository,
    private readonly documentRepository: DocumentRepository,
  ) {}

  /** Idempotent — a case has at most one will (case_id is unique), so this fetches the existing row or creates it, never both. */
  async getOrCreateWill(caseId: string): Promise<Will> {
    const estate = await this.estateRepository.getEstate(caseId);
    if (!estate) {
      throw new WillNotFoundError("Case not found, or you don't have access to it.");
    }
    requireSelfPlannedLivingCase(estate);

    const existing = await this.repository.getWillByCaseId(caseId);
    if (existing) return existing;

    try {
      return await this.repository.createWill(caseId);
    } catch (error) {
      translateRepositoryError(error);
    }
  }

  async getWill(willId: string): Promise<Will> {
    const will = await this.repository.getWill(willId);
    if (!will) {
      throw new WillNotFoundError("Will not found, or you don't have access to it.");
    }
    return will;
  }

  async updateGuardianInfo(willId: string, input: {
    hasMinorChildren: unknown;
    guardianFullName?: unknown;
    guardianRelationship?: unknown;
    alternateGuardianFullName?: unknown;
    alternateGuardianRelationship?: unknown;
  }): Promise<Will> {
    if (typeof input.hasMinorChildren !== "boolean") {
      throw new InvalidWillInputError("hasMinorChildren must be a boolean.");
    }
    const validated: UpdateGuardianInfoInput = {
      hasMinorChildren: input.hasMinorChildren,
      guardianFullName: validateOptionalText(input.guardianFullName, "guardianFullName"),
      guardianRelationship: validateOptionalText(input.guardianRelationship, "guardianRelationship"),
      alternateGuardianFullName: validateOptionalText(input.alternateGuardianFullName, "alternateGuardianFullName"),
      alternateGuardianRelationship: validateOptionalText(
        input.alternateGuardianRelationship,
        "alternateGuardianRelationship",
      ),
    };
    try {
      return await this.repository.updateGuardianInfo(willId, validated);
    } catch (error) {
      translateRepositoryError(error);
    }
  }

  async updateResiduaryClause(willId: string, description: unknown): Promise<Will> {
    const validated = validateOptionalText(description, "residuaryBeneficiaryDescription");
    try {
      return await this.repository.updateResiduaryClause(willId, validated);
    } catch (error) {
      translateRepositoryError(error);
    }
  }

  async listBequests(willId: string): Promise<WillBequest[]> {
    return this.repository.listBequests(willId);
  }

  async createBequest(willId: string, input: {
    bequestCategory: unknown;
    digitalAssetId?: unknown;
    beneficiaryId?: unknown;
    description?: unknown;
    displayOrder?: unknown;
  }): Promise<WillBequest> {
    const bequestCategory = validateBequestCategory(input.bequestCategory);
    const digitalAssetId = (input.digitalAssetId as string | null | undefined) ?? null;
    const beneficiaryId = (input.beneficiaryId as string | null | undefined) ?? null;
    const description = validateOptionalText(input.description, "description", MAX_DESCRIPTION_LENGTH);
    requireLinkOrDescription(digitalAssetId, beneficiaryId, description);

    const validated: CreateBequestInput = {
      bequestCategory,
      digitalAssetId,
      beneficiaryId,
      description,
      displayOrder: typeof input.displayOrder === "number" ? input.displayOrder : 0,
    };
    try {
      return await this.repository.createBequest(willId, validated);
    } catch (error) {
      translateRepositoryError(error);
    }
  }

  async updateBequest(bequestId: string, input: {
    bequestCategory?: unknown;
    digitalAssetId?: unknown;
    beneficiaryId?: unknown;
    description?: unknown;
    displayOrder?: unknown;
  }): Promise<WillBequest> {
    const validated: UpdateBequestInput = {};
    if (input.bequestCategory !== undefined) validated.bequestCategory = validateBequestCategory(input.bequestCategory);
    if (input.digitalAssetId !== undefined) validated.digitalAssetId = input.digitalAssetId as string | null;
    if (input.beneficiaryId !== undefined) validated.beneficiaryId = input.beneficiaryId as string | null;
    if (input.description !== undefined)
      validated.description = validateOptionalText(input.description, "description", MAX_DESCRIPTION_LENGTH);
    if (input.displayOrder !== undefined && typeof input.displayOrder === "number")
      validated.displayOrder = input.displayOrder;

    try {
      return await this.repository.updateBequest(bequestId, validated);
    } catch (error) {
      translateRepositoryError(error);
    }
  }

  async deleteBequest(bequestId: string): Promise<void> {
    try {
      return await this.repository.deleteBequest(bequestId);
    } catch (error) {
      translateRepositoryError(error);
    }
  }

  /**
   * Composes testator (from the Case) + executor/alternate (from
   * case_members, live) + guardian + bequests (resolving linked
   * digital_assets/beneficiaries display text) + residuary + the
   * jurisdiction's execution requirements into a new frozen
   * will_versions row, generates a PDF, and stores it via the existing
   * documents table (documentType: "will") — same shape as
   * NotificationLetterService.finalize. Refuses outright if no execution
   * requirements are on file for this Case's jurisdiction (see the
   * migration's own comment on why this table ships empty) or if the
   * will has been revoked. Regenerating an already-executed will moves it
   * back to ready_to_sign — the prior signed content remains in
   * will_versions history, but a fresh signature is now required.
   */
  async generateDocument(willId: string, caseId: string, userId: string): Promise<Will> {
    const will = await this.getWill(willId);
    if (will.status === "revoked") {
      throw new WillAlreadyFinalizedError("This will has been revoked and can no longer be generated.");
    }

    const estate = await this.estateRepository.getEstate(caseId);
    if (!estate || !estate.deceasedFullName) {
      throw new WillNotFoundError("Case not found, or you don't have access to it.");
    }

    const requirements = await this.executionRequirementRepository.listRequirements({
      jurisdictionId: estate.jurisdictionId,
    });
    const requirement = requirements[0];
    if (!requirement) {
      throw new InvalidWillInputError(
        "No execution requirements are on file for your jurisdiction yet — a will cannot be finalized until AfterVault has them configured. Contact support.",
      );
    }

    const executors = await this.repository.listExecutors(caseId);
    const bequests = await this.repository.listBequests(willId);
    const resolvedBequests = await Promise.all(
      bequests.map(async (bequest) => {
        let linkedDisplayText: string | null = null;
        if (bequest.digitalAssetId) {
          const asset = await this.digitalAssetRepository.getAsset(bequest.digitalAssetId);
          linkedDisplayText = asset?.customProviderName ?? null;
        } else if (bequest.beneficiaryId) {
          const beneficiary = await this.beneficiaryRepository.getBeneficiary(bequest.beneficiaryId);
          linkedDisplayText = beneficiary?.displayName ?? null;
        }
        return { bequest, linkedDisplayText };
      }),
    );

    const content = renderWillContent({
      testatorFullName: estate.deceasedFullName,
      testatorDateOfBirth: estate.deceasedDateOfBirth,
      caseDisplayName: estate.displayName,
      executors,
      hasMinorChildren: will.hasMinorChildren,
      guardianFullName: will.guardianFullName,
      guardianRelationship: will.guardianRelationship,
      alternateGuardianFullName: will.alternateGuardianFullName,
      alternateGuardianRelationship: will.alternateGuardianRelationship,
      bequests: resolvedBequests,
      residuaryBeneficiaryDescription: will.residuaryBeneficiaryDescription,
      executionRequirement: requirement,
    });

    const version = await this.repository.createVersion(willId, content);
    const pdfBytes = await generateWillPdf({ testatorFullName: estate.deceasedFullName, content });
    // The will itself doesn't need to track the resulting document id — it's discoverable via the Case's document list like any other document.
    await this.documentRepository.uploadDocument(caseId, userId, {
      documentType: "will",
      fileName: `will-${estate.deceasedFullName}.pdf`,
      mimeType: "application/pdf",
      fileBytes: pdfBytes,
    });

    try {
      return await this.repository.setStatus(willId, "ready_to_sign", { currentVersionId: version.id });
    } catch (error) {
      translateRepositoryError(error);
    }
  }

  async markExecuted(willId: string): Promise<Will> {
    const will = await this.getWill(willId);
    if (will.status !== "ready_to_sign") {
      throw new WillAlreadyFinalizedError(
        `A will can only be marked executed from "ready_to_sign" — this one is currently "${will.status}".`,
      );
    }
    try {
      return await this.repository.setStatus(willId, "executed", { executedAt: new Date().toISOString() });
    } catch (error) {
      translateRepositoryError(error);
    }
  }

  async revoke(willId: string): Promise<Will> {
    const will = await this.getWill(willId);
    if (will.status === "revoked") {
      throw new WillAlreadyFinalizedError("This will has already been revoked.");
    }
    try {
      return await this.repository.setStatus(willId, "revoked");
    } catch (error) {
      translateRepositoryError(error);
    }
  }
}
