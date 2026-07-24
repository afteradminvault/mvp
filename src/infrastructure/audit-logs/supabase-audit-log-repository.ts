import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditLogEntry, AuditLogListResult, AuditLogRepository, ListAuditLogsFilter } from "@/domain/audit-logs/ports";

interface AuditLogRow {
  id: string;
  estate_id: string | null;
  actor_user_id: string | null;
  event_type: string;
  target_table: string | null;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

function toAuditLogEntry(row: AuditLogRow): AuditLogEntry {
  return {
    id: row.id,
    estateId: row.estate_id,
    actorUserId: row.actor_user_id,
    eventType: row.event_type,
    targetTable: row.target_table,
    targetId: row.target_id,
    metadata: row.metadata,
    ipAddress: row.ip_address,
    createdAt: row.created_at,
  };
}

/**
 * Concrete adapter against Supabase. Read-only (audit_logs has no
 * UPDATE/DELETE grant at the database role level — Database Schema §6.1),
 * and this repository never attempts either. Requests an exact count
 * alongside the page of rows in the same query (Supabase/PostgREST's
 * `count: "exact"` option, a single `COUNT(*) OVER()`-backed round trip,
 * not a second query) so the UI can show "page N of M" without a separate
 * request.
 */
export class SupabaseAuditLogRepository implements AuditLogRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async listAuditLogs(estateId: string, filter: ListAuditLogsFilter): Promise<AuditLogListResult> {
    let query = this.supabase
      .from("audit_logs")
      .select("*", { count: "exact" })
      .eq("estate_id", estateId);

    if (filter.eventType) query = query.eq("event_type", filter.eventType);
    if (filter.from) query = query.gte("created_at", filter.from);
    if (filter.to) query = query.lte("created_at", filter.to);

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(filter.offset, filter.offset + filter.limit - 1);
    if (error) throw error;

    return {
      entries: (data as AuditLogRow[]).map(toAuditLogEntry),
      total: count ?? 0,
    };
  }
}
