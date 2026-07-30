import type { AuditLogListResult, AuditLogRepository } from "./ports";

export const DEFAULT_AUDIT_LOG_LIMIT = 50;
export const MAX_AUDIT_LOG_LIMIT = 100;

/**
 * event_type is free text (Database Schema §6.1 — "e.g. vault_item_viewed,
 * ..."), not a Postgres ENUM, since new event types get added alongside
 * new features without a schema migration. This list is every value
 * actually written by the app as of Milestone 3 feature 3 — for the UI's
 * filter-input autocomplete hint only, never validated against here (an
 * event type outside this list is not an error, just an unlisted one).
 */
export const KNOWN_AUDIT_EVENT_TYPES: readonly string[] = [
  "vault_items_viewed",
  "vault_item_created",
  "vault_item_rotated",
  "vault_item_deleted",
  "member_invited",
  "member_invite_accepted",
  "member_key_share_wrapped",
  "member_revoked",
  "vault_key_initialized",
  "key_recovery_used",
  "checkin_overdue_detected",
  "death_reported",
  "verification_notice_sent",
  "self_cancel_used",
  "verification_window_lapsed",
  "active_executor_activated",
  "document_uploaded",
  "document_downloaded",
  "document_deleted",
  "closure_request_created",
  "closure_request_status_changed",
  "closure_request_document_attached",
  "closure_request_stale_nudge_sent",
];

export class InvalidAuditLogQueryError extends Error {}

function validateEventType(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new InvalidAuditLogQueryError("eventType must be a string if provided.");
  }
  return value.trim();
}

function validateDateBound(value: unknown, fieldName: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || Number.isNaN(new Date(value).getTime())) {
    throw new InvalidAuditLogQueryError(`${fieldName} must be a valid date if provided.`);
  }
  return value;
}

function validateLimit(value: unknown): number {
  if (value === undefined || value === null || value === "") return DEFAULT_AUDIT_LOG_LIMIT;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_AUDIT_LOG_LIMIT) {
    throw new InvalidAuditLogQueryError(`limit must be an integer between 1 and ${MAX_AUDIT_LOG_LIMIT}.`);
  }
  return parsed;
}

function validateOffset(value: unknown): number {
  if (value === undefined || value === null || value === "") return 0;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new InvalidAuditLogQueryError("offset must be a non-negative integer.");
  }
  return parsed;
}

function validateActorUserId(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new InvalidAuditLogQueryError("actorUserId must be a string if provided.");
  }
  return value.trim();
}

/**
 * Orchestrates the read-only audit-log view (Database Schema §6.1, API
 * Specification §13, Security Architecture §3.3's dispute-resolution/
 * trust-building view). Authorization is entirely RLS-backed
 * (audit_logs_select_owner_or_executor, already in place from the initial
 * schema migration — a Helper querying this simply gets an empty result,
 * same as every other RLS-gated list in this codebase) — this service only
 * validates the filter/pagination inputs.
 */
export class AuditLogService {
  constructor(private readonly repository: AuditLogRepository) {}

  async listAuditLogs(
    estateId: string,
    query: { eventType?: unknown; from?: unknown; to?: unknown; limit?: unknown; offset?: unknown },
  ): Promise<AuditLogListResult> {
    const eventType = validateEventType(query.eventType);
    const from = validateDateBound(query.from, "from");
    const to = validateDateBound(query.to, "to");
    if (from !== undefined && to !== undefined && new Date(from).getTime() > new Date(to).getTime()) {
      throw new InvalidAuditLogQueryError("from must be before or equal to to.");
    }
    const limit = validateLimit(query.limit);
    const offset = validateOffset(query.offset);

    return this.repository.listAuditLogs(estateId, { eventType, from, to, limit, offset });
  }

  /** US-8.7 — the system-wide admin view (audit_logs_select_admin RLS gates this to platform admins). */
  async listAllAuditLogs(query: {
    eventType?: unknown;
    actorUserId?: unknown;
    from?: unknown;
    to?: unknown;
    limit?: unknown;
    offset?: unknown;
  }): Promise<AuditLogListResult> {
    const eventType = validateEventType(query.eventType);
    const actorUserId = validateActorUserId(query.actorUserId);
    const from = validateDateBound(query.from, "from");
    const to = validateDateBound(query.to, "to");
    if (from !== undefined && to !== undefined && new Date(from).getTime() > new Date(to).getTime()) {
      throw new InvalidAuditLogQueryError("from must be before or equal to to.");
    }
    const limit = validateLimit(query.limit);
    const offset = validateOffset(query.offset);

    return this.repository.listAllAuditLogs({ eventType, actorUserId, from, to, limit, offset });
  }
}
