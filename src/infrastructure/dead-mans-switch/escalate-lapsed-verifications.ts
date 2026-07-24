import type { SupabaseClient } from "@supabase/supabase-js";

export interface LapsedVerificationEstate {
  id: string;
  verificationStartedAt: string | null;
}

interface EstateRow {
  id: string;
  verification_started_at: string | null;
}

/**
 * The self-cancel window expiring with no cancel (Security Architecture
 * §4.2) — verifying -> awaiting_death_certificate. See
 * escalate_lapsed_verifications() in
 * supabase/migrations/20260723000200_death_verification_functions.sql.
 */
export async function escalateLapsedVerifications(supabase: SupabaseClient): Promise<LapsedVerificationEstate[]> {
  const { data, error } = await supabase.rpc("escalate_lapsed_verifications");
  if (error) throw error;

  return (data as EstateRow[]).map((row) => ({
    id: row.id,
    verificationStartedAt: row.verification_started_at,
  }));
}
