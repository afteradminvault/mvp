import type { SupabaseClient } from "@supabase/supabase-js";

export interface EscalatedEstate {
  id: string;
  lastCheckInAt: string;
}

interface EstateRow {
  id: string;
  last_check_in_at: string;
}

/**
 * The automated backstop entry point into the verification pipeline
 * (Security Architecture §4.3) — a checkin_overdue estate with no
 * reporting executor/helper still needs to progress once
 * check_in_interval_days + grace_period_days has elapsed. See
 * escalate_overdue_to_verifying() in
 * supabase/migrations/20260723000200_death_verification_functions.sql for
 * why this can't be a PostgREST filter (per-row comparison against other
 * columns on the same row).
 */
export async function escalateOverdueToVerifying(supabase: SupabaseClient): Promise<EscalatedEstate[]> {
  const { data, error } = await supabase.rpc("escalate_overdue_to_verifying");
  if (error) throw error;

  return (data as EstateRow[]).map((row) => ({
    id: row.id,
    lastCheckInAt: row.last_check_in_at,
  }));
}
