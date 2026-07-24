import type { RequirementType, SubmissionChannel } from "@/domain/admin-legal-requirements/ports";

/**
 * Account closure request domain contracts (Database Schema §5.2-§5.3, API
 * Specification §10). Framework-free, same rationale as the other
 * ports.ts files.
 */

export type ClosureStatus =
  | "not_started"
  | "documents_gathered"
  | "submitted"
  | "in_progress"
  | "resolved"
  | "rejected"
  | "needs_attention"
  | "out_of_scope";

/**
 * A frozen subset of a legal_requirements row's fields, captured at
 * closure-request creation time (Database Schema §5.2: "so later edits to
 * legal_requirements reference data don't silently rewrite an in-progress
 * request's checklist out from under the executor"). Deliberately omits
 * jurisdictionId/assetCategory (implied by the request's own asset/estate)
 * and versioning/administrative metadata (effectiveDate, supersededById,
 * createdAt/updatedAt) that has no meaning once frozen.
 */
export interface LegalRequirementSnapshotItem {
  id: string;
  requirementType: RequirementType;
  submissionChannel: SubmissionChannel;
  submissionDetail: string | null;
  displayOrder: number;
  providerId: string | null;
  notes: string | null;
  pendingCounselReview: boolean;
}

export interface AccountClosureRequest {
  id: string;
  digitalAssetId: string;
  estateId: string;
  status: ClosureStatus;
  assignedToUserId: string | null;
  legalRequirementSnapshot: LegalRequirementSnapshotItem[];
  lastStatusChangeAt: string;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateClosureRequestInput {
  status?: ClosureStatus;
  assignedToUserId?: string | null;
}

export interface ListClosureRequestsFilter {
  status?: ClosureStatus;
  category?: string;
}

/**
 * The subset of an AccountClosureRequest returned by
 * mark_stale_closure_requests_needing_nudge() (Milestone 2 feature 8) —
 * just enough for StaleClosureRequestNudgeService to resolve recipients and
 * assemble the nudge email, not the full row (e.g. no
 * legalRequirementSnapshot).
 */
export interface StaleClosureRequest {
  id: string;
  estateId: string;
  digitalAssetId: string;
  assignedToUserId: string | null;
  status: ClosureStatus;
  lastStatusChangeAt: string;
}

export interface ClosureRequestRepository {
  createClosureRequest(
    estateId: string,
    assetId: string,
    legalRequirementSnapshot: LegalRequirementSnapshotItem[],
  ): Promise<AccountClosureRequest>;
  getClosureRequest(requestId: string): Promise<AccountClosureRequest | null>;
  listClosureRequests(estateId: string, filter?: ListClosureRequestsFilter): Promise<AccountClosureRequest[]>;
  updateClosureRequest(requestId: string, input: UpdateClosureRequestInput): Promise<AccountClosureRequest>;
  /** Looks up a document's own estate_id, for the cross-estate guard in the service — never trusts the caller's claim. */
  getDocumentEstateId(documentId: string): Promise<string | null>;
  attachDocument(requestId: string, documentId: string): Promise<void>;
  /**
   * Atomically selects requests that have gone stale and haven't already
   * been nudged for the current staleness episode, marking them nudged in
   * the same call (see mark_stale_closure_requests_needing_nudge() in
   * supabase/migrations/20260727000000_mark_stale_closure_requests_function.sql).
   */
  markStaleRequestsNeedingNudge(thresholdDays: number): Promise<StaleClosureRequest[]>;
}
