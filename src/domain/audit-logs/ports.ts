/**
 * Audit log domain contracts (Database Schema §6.1, API Specification
 * §13). Framework-free, same rationale as the other ports.ts files.
 * Read-only — there is no write path through this domain; every row is
 * written as a side effect of some other action via
 * src/app/api/_lib/audit-log.ts or a SECURITY DEFINER SQL function, per
 * Security Architecture §3.3.
 */
export interface AuditLogEntry {
  id: string;
  estateId: string | null;
  actorUserId: string | null;
  eventType: string;
  targetTable: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

export interface ListAuditLogsFilter {
  eventType?: string;
  /** Inclusive lower bound on created_at. */
  from?: string;
  /** Inclusive upper bound on created_at. */
  to?: string;
  limit: number;
  offset: number;
}

/** US-8.7 — the system-wide (not per-case) admin view; adds actorUserId, the one extra filter dimension that view's AC calls for. */
export interface ListAllAuditLogsFilter extends ListAuditLogsFilter {
  actorUserId?: string;
}

export interface AuditLogListResult {
  entries: AuditLogEntry[];
  /** Total rows matching the filter, ignoring limit/offset — drives the pagination UI's "page N of M". */
  total: number;
}

export interface AuditLogRepository {
  listAuditLogs(estateId: string, filter: ListAuditLogsFilter): Promise<AuditLogListResult>;
  /** US-8.7 — platform admins only (audit_logs_select_admin RLS); no estate scoping. */
  listAllAuditLogs(filter: ListAllAuditLogsFilter): Promise<AuditLogListResult>;
}
