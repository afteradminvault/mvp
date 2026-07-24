import type { AssetCategory, DigitalAssetRepository } from "@/domain/assets/ports";
import type { EstateRepository } from "@/domain/estates/ports";
import type { LegalRequirementRepository } from "@/domain/admin-legal-requirements/ports";
import type {
  AccountClosureRequest,
  ClosureRequestRepository,
  ClosureStatus,
  LegalRequirementSnapshotItem,
  ListClosureRequestsFilter,
  UpdateClosureRequestInput,
} from "./ports";

export const CLOSURE_STATUSES: readonly ClosureStatus[] = [
  "not_started",
  "documents_gathered",
  "submitted",
  "in_progress",
  "resolved",
  "rejected",
  "needs_attention",
  "out_of_scope",
];

export class InvalidClosureRequestInputError extends Error {}
export class ClosureRequestNotFoundError extends Error {}
export class ClosureRequestForbiddenError extends Error {}

function validateStatus(value: unknown): ClosureStatus {
  if (typeof value !== "string" || !CLOSURE_STATUSES.includes(value as ClosureStatus)) {
    throw new InvalidClosureRequestInputError(`status must be one of: ${CLOSURE_STATUSES.join(", ")}.`);
  }
  return value as ClosureStatus;
}

function validateAssignedToUserId(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidClosureRequestInputError("assignedToUserId must be a non-empty string, or null to unassign.");
  }
  return value.trim();
}

function validateDocumentId(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidClosureRequestInputError("documentId is required.");
  }
  return value.trim();
}

/** Every RLS-backed write in this domain raises a plain Postgres exception; this maps it once, in one place. */
function translateRepositoryError(error: unknown): never {
  if (error instanceof Error && /row-level security|permission denied/i.test(error.message)) {
    throw new ClosureRequestForbiddenError("Only an accepted executor for this estate can do that.");
  }
  throw error;
}

/**
 * Orchestrates account closure requests (Database Schema §5.2-§5.3, API
 * Specification §10). Authorization is entirely RLS-backed (no new
 * migration needed for this feature — closure_requests_select_member /
 * closure_requests_write_executor / acrd_select_member / acrd_write_executor
 * were already in place from the initial schema migration) — this service
 * validates input and generates the checklist snapshot, translating RLS
 * denials the same way every other domain in this codebase does.
 */
export class ClosureRequestService {
  constructor(
    private readonly repository: ClosureRequestRepository,
    private readonly assetRepository: DigitalAssetRepository,
    private readonly estateRepository: EstateRepository,
    private readonly legalRequirementRepository: LegalRequirementRepository,
  ) {}

  /**
   * Resolves the current legal_requirements checklist for this asset's
   * category + the estate's jurisdiction, then freezes it into the new
   * request's legal_requirement_snapshot. Provider-specific rows are
   * additive alongside jurisdiction+category-generic ones (both apply),
   * not a replacement — the schema doesn't distinguish "override" from
   * "addition" with a dedicated relationship, and additive is the safer
   * reading (more disclosed requirements, never fewer). Rows not yet
   * effective (effective_date in the future) are excluded.
   */
  async createClosureRequest(estateId: string, assetId: string): Promise<AccountClosureRequest> {
    const asset = await this.assetRepository.getAsset(assetId);
    if (!asset || asset.estateId !== estateId) {
      throw new ClosureRequestNotFoundError("Asset not found, or you don't have access to it.");
    }
    const estate = await this.estateRepository.getEstate(estateId);
    if (!estate) {
      throw new ClosureRequestNotFoundError("Estate not found, or you don't have access to it.");
    }

    const candidates = await this.legalRequirementRepository.listRequirements({
      jurisdictionId: estate.jurisdictionId,
      assetCategory: asset.category,
    });
    const today = new Date().toISOString().slice(0, 10);
    const snapshot: LegalRequirementSnapshotItem[] = candidates
      .filter(
        (requirement) =>
          (requirement.providerId === null || requirement.providerId === asset.providerId) &&
          requirement.effectiveDate <= today,
      )
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((requirement) => ({
        id: requirement.id,
        requirementType: requirement.requirementType,
        submissionChannel: requirement.submissionChannel,
        submissionDetail: requirement.submissionDetail,
        displayOrder: requirement.displayOrder,
        providerId: requirement.providerId,
        notes: requirement.notes,
        pendingCounselReview: requirement.pendingCounselReview,
      }));

    try {
      return await this.repository.createClosureRequest(estateId, assetId, snapshot);
    } catch (error) {
      translateRepositoryError(error);
    }
  }

  async getClosureRequest(requestId: string): Promise<AccountClosureRequest> {
    const request = await this.repository.getClosureRequest(requestId);
    if (!request) {
      throw new ClosureRequestNotFoundError("Closure request not found, or you don't have access to it.");
    }
    return request;
  }

  async listClosureRequests(
    estateId: string,
    filter?: { status?: unknown; category?: unknown },
  ): Promise<AccountClosureRequest[]> {
    const validated: ListClosureRequestsFilter = {};
    if (filter?.status !== undefined) validated.status = validateStatus(filter.status);
    if (filter?.category !== undefined) {
      if (typeof filter.category !== "string" || filter.category.trim().length === 0) {
        throw new InvalidClosureRequestInputError("category must be a non-empty string if provided.");
      }
      validated.category = filter.category as AssetCategory;
    }
    return this.repository.listClosureRequests(estateId, validated);
  }

  async updateClosureRequest(
    requestId: string,
    input: { status?: unknown; assignedToUserId?: unknown },
  ): Promise<AccountClosureRequest> {
    const patch: UpdateClosureRequestInput = {};
    if (input.status !== undefined) patch.status = validateStatus(input.status);
    if (input.assignedToUserId !== undefined) patch.assignedToUserId = validateAssignedToUserId(input.assignedToUserId);
    if (Object.keys(patch).length === 0) {
      throw new InvalidClosureRequestInputError("No valid fields to update.");
    }

    try {
      return await this.repository.updateClosureRequest(requestId, patch);
    } catch (error) {
      translateRepositoryError(error);
    }
  }

  /** Rejects attaching a document that belongs to a different estate — never trusts the caller's claim, always re-derives it from the document's own row. */
  async attachDocument(requestId: string, documentId: unknown): Promise<AccountClosureRequest> {
    const validDocumentId = validateDocumentId(documentId);
    const request = await this.getClosureRequest(requestId);

    const documentEstateId = await this.repository.getDocumentEstateId(validDocumentId);
    if (!documentEstateId) {
      throw new ClosureRequestNotFoundError("Document not found, or you don't have access to it.");
    }
    if (documentEstateId !== request.estateId) {
      throw new InvalidClosureRequestInputError("This document belongs to a different estate and can't be attached.");
    }

    try {
      await this.repository.attachDocument(requestId, validDocumentId);
    } catch (error) {
      translateRepositoryError(error);
    }
    return this.getClosureRequest(requestId);
  }
}
