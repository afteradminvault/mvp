import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AccountClosureRequest,
  ClosureRequestRepository,
  ClosureStatus,
  LegalRequirementSnapshotItem,
  ListClosureRequestsFilter,
  StaleClosureRequest,
  UpdateClosureRequestInput,
} from "@/domain/closure-requests/ports";

interface ClosureRequestRow {
  id: string;
  digital_asset_id: string;
  estate_id: string;
  status: ClosureStatus;
  assigned_to_user_id: string | null;
  legal_requirement_snapshot: LegalRequirementSnapshotItem[];
  last_status_change_at: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

function toClosureRequest(row: ClosureRequestRow): AccountClosureRequest {
  return {
    id: row.id,
    digitalAssetId: row.digital_asset_id,
    estateId: row.estate_id,
    status: row.status,
    assignedToUserId: row.assigned_to_user_id,
    legalRequirementSnapshot: row.legal_requirement_snapshot,
    lastStatusChangeAt: row.last_status_change_at,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SupabaseClosureRequestRepository implements ClosureRequestRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async createClosureRequest(
    estateId: string,
    assetId: string,
    legalRequirementSnapshot: LegalRequirementSnapshotItem[],
  ): Promise<AccountClosureRequest> {
    const { data, error } = await this.supabase
      .from("account_closure_requests")
      .insert({
        digital_asset_id: assetId,
        estate_id: estateId,
        legal_requirement_snapshot: legalRequirementSnapshot,
      })
      .select("*")
      .single();
    if (error) throw error;
    return toClosureRequest(data as ClosureRequestRow);
  }

  async getClosureRequest(requestId: string): Promise<AccountClosureRequest | null> {
    const { data, error } = await this.supabase
      .from("account_closure_requests")
      .select("*")
      .eq("id", requestId)
      .maybeSingle();
    if (error) throw error;
    return data ? toClosureRequest(data as ClosureRequestRow) : null;
  }

  async listClosureRequests(
    estateId: string,
    filter?: ListClosureRequestsFilter,
  ): Promise<AccountClosureRequest[]> {
    let query = filter?.category
      ? this.supabase
          .from("account_closure_requests")
          .select("*, digital_assets!inner(category)")
          .eq("digital_assets.category", filter.category)
      : this.supabase.from("account_closure_requests").select("*");

    query = query.eq("estate_id", estateId);
    if (filter?.status) {
      query = query.eq("status", filter.status);
    }

    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw error;
    return (data as ClosureRequestRow[]).map(toClosureRequest);
  }

  /**
   * last_status_change_at only bumps when status actually changes (not on
   * a no-op re-save of the same value) — it drives the stale-request
   * reminder job's scan (Database Schema §5.2), so resetting it
   * needlessly would mask genuinely stale requests. resolved_at is set
   * exactly when status becomes 'resolved' and cleared if it moves away
   * again (e.g. an accidental resolve, undone).
   */
  async updateClosureRequest(requestId: string, input: UpdateClosureRequestInput): Promise<AccountClosureRequest> {
    const patch: Record<string, unknown> = {};
    if (input.assignedToUserId !== undefined) {
      patch.assigned_to_user_id = input.assignedToUserId;
    }

    if (input.status !== undefined) {
      const { data: current, error: currentError } = await this.supabase
        .from("account_closure_requests")
        .select("status")
        .eq("id", requestId)
        .single();
      if (currentError) throw currentError;

      if (current.status !== input.status) {
        patch.status = input.status;
        patch.last_status_change_at = new Date().toISOString();
        patch.resolved_at = input.status === "resolved" ? new Date().toISOString() : null;
      }
    }

    const { data, error } = await this.supabase
      .from("account_closure_requests")
      .update(patch)
      .eq("id", requestId)
      .select("*")
      .single();
    if (error) throw error;
    return toClosureRequest(data as ClosureRequestRow);
  }

  async getDocumentEstateId(documentId: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .from("documents")
      .select("estate_id")
      .eq("id", documentId)
      .maybeSingle();
    if (error) throw error;
    return data?.estate_id ?? null;
  }

  async attachDocument(requestId: string, documentId: string): Promise<void> {
    const { error } = await this.supabase
      .from("account_closure_request_documents")
      .insert({ account_closure_request_id: requestId, document_id: documentId });
    if (error) throw error;
  }

  /**
   * See mark_stale_closure_requests_needing_nudge() in
   * supabase/migrations/20260727000000_mark_stale_closure_requests_function.sql
   * — the scan and the "mark nudged" write happen atomically inside that
   * function, not here.
   */
  async markStaleRequestsNeedingNudge(thresholdDays: number): Promise<StaleClosureRequest[]> {
    const { data, error } = await this.supabase.rpc("mark_stale_closure_requests_needing_nudge", {
      p_threshold_days: thresholdDays,
    });
    if (error) throw error;

    return (
      data as {
        id: string;
        estate_id: string;
        digital_asset_id: string;
        assigned_to_user_id: string | null;
        status: ClosureStatus;
        last_status_change_at: string;
      }[]
    ).map((row) => ({
      id: row.id,
      estateId: row.estate_id,
      digitalAssetId: row.digital_asset_id,
      assignedToUserId: row.assigned_to_user_id,
      status: row.status,
      lastStatusChangeAt: row.last_status_change_at,
    }));
  }
}
