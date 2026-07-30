import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReadinessFacts, ReadinessRepository } from "@/domain/readiness/ports";

/**
 * Concrete adapter against Supabase. Verifies the caller is this estate's
 * Owner first (same "not found = forbidden, found = the real state"
 * distinction as SupabaseVaultKeyRepository) since a non-owner asking
 * about a readiness score they can't act on isn't a valid request, not
 * just an RLS-invisible one.
 */
export class SupabaseReadinessRepository implements ReadinessRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async getReadinessFacts(estateId: string): Promise<ReadinessFacts> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) {
      throw new Error("must be authenticated to view a readiness score");
    }

    const { data: ownerRow, error: ownerRowError } = await this.supabase
      .from("case_members")
      .select("role")
      .eq("case_id", estateId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (ownerRowError) throw ownerRowError;
    if (!ownerRow || ownerRow.role !== "family") {
      throw new Error("only the case owner can view this case's readiness score");
    }

    const { count: totalAssetCount, error: totalError } = await this.supabase
      .from("digital_assets")
      .select("*", { count: "exact", head: true })
      .eq("estate_id", estateId)
      .is("archived_at", null);
    if (totalError) throw totalError;

    const { count: assetsWithInstructionsCount, error: instructionsError } = await this.supabase
      .from("digital_assets")
      .select("*", { count: "exact", head: true })
      .eq("estate_id", estateId)
      .is("archived_at", null)
      .or("intended_outcome.neq.other,intended_outcome_notes.not.is.null");
    if (instructionsError) throw instructionsError;

    const { count: acceptedExecutorCount, error: executorError } = await this.supabase
      .from("case_members")
      .select("*", { count: "exact", head: true })
      .eq("case_id", estateId)
      .eq("role", "executor")
      .eq("invite_status", "accepted");
    if (executorError) throw executorError;

    const { count: acceptedBackupExecutorCount, error: backupError } = await this.supabase
      .from("case_members")
      .select("*", { count: "exact", head: true })
      .eq("case_id", estateId)
      .eq("role", "executor")
      .eq("invite_status", "accepted")
      .not("fallback_order", "is", null);
    if (backupError) throw backupError;

    const { data: ownerUser, error: ownerUserError } = await this.supabase
      .from("users")
      .select("mfa_enabled")
      .eq("id", user.id)
      .single();
    if (ownerUserError) throw ownerUserError;

    return {
      totalAssetCount: totalAssetCount ?? 0,
      assetsWithInstructionsCount: assetsWithInstructionsCount ?? 0,
      hasAcceptedExecutor: (acceptedExecutorCount ?? 0) > 0,
      ownerMfaEnabled: ownerUser.mfa_enabled,
      hasAcceptedBackupExecutor: (acceptedBackupExecutorCount ?? 0) > 0,
    };
  }
}
