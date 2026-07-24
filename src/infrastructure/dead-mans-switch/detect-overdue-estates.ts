import type { SupabaseClient } from "@supabase/supabase-js";

export interface OverdueEstate {
  id: string;
  lastCheckInAt: string;
  checkInIntervalDays: number;
}

interface EstateRow {
  id: string;
  last_check_in_at: string;
  check_in_interval_days: number;
}

/**
 * The check-in-overdue detection sweep (Security Architecture §4.1's
 * active_living -> checkin_overdue transition), called by the Vercel Cron
 * route at src/app/api/cron/check-in-overdue/route.ts. The actual
 * transition + audit logging happens atomically inside the
 * mark_overdue_estates() Postgres function (see
 * supabase/migrations/20260722010000_mark_overdue_estates.sql) — this is a
 * thin wrapper, not a domain service, since there's no input to validate
 * and no authorization branching (the caller always runs as the service
 * role).
 */
export async function detectAndMarkOverdueEstates(supabase: SupabaseClient): Promise<OverdueEstate[]> {
  const { data, error } = await supabase.rpc("mark_overdue_estates");
  if (error) throw error;

  return (data as EstateRow[]).map((row) => ({
    id: row.id,
    lastCheckInAt: row.last_check_in_at,
    checkInIntervalDays: row.check_in_interval_days,
  }));
}
