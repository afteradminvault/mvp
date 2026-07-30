import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Writes an audit_logs row via the session's own client (never the service
 * role), relying on the audit_logs_insert_self RLS policy
 * (supabase/migrations/20260719120100_rls_policies.sql) to enforce that a
 * caller can only log events attributed to themselves, for an estate
 * they're actually a member of. Per Security Architecture §3.3: this
 * records that an authorized fetch/write happened — it cannot and does not
 * claim anything about what the client did with the data afterward (e.g.
 * whether client-side decryption succeeded).
 *
 * Best-effort: a logging failure must never break the actual operation it
 * describes, so callers should not let this throw block a response — log
 * and swallow.
 */
export async function writeAuditLog(
  supabase: SupabaseClient,
  params: {
    /** Null for platform-wide events with no single estate (e.g. admin user/provider management, US-8.x) — audit_logs_insert_self already permits estate_id is null for any authenticated caller logging their own actions. */
    estateId: string | null;
    actorUserId: string;
    eventType: string;
    targetTable?: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    const { error } = await supabase.from("audit_logs").insert({
      estate_id: params.estateId,
      actor_user_id: params.actorUserId,
      event_type: params.eventType,
      target_table: params.targetTable ?? null,
      target_id: params.targetId ?? null,
      metadata: params.metadata ?? null,
    });
    if (error) throw error;
  } catch (error) {
    console.error("Failed to write audit log entry:", error);
  }
}
