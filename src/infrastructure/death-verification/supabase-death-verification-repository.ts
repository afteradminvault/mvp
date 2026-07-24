import type { SupabaseClient } from "@supabase/supabase-js";
import type { Estate } from "@/domain/estates/ports";
import type { DeathVerificationRepository } from "@/domain/death-verification/ports";
import { toEstate, type EstateRow } from "@/infrastructure/estates/supabase-estate-repository";

export class SupabaseDeathVerificationRepository implements DeathVerificationRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async reportDeath(estateId: string): Promise<Estate> {
    const { data, error } = await this.supabase.rpc("report_death", { p_estate_id: estateId });
    if (error) throw error;
    return toEstate(data as EstateRow);
  }

  async selfCancel(estateId: string): Promise<Estate> {
    const { data, error } = await this.supabase.rpc("self_cancel", { p_estate_id: estateId });
    if (error) throw error;
    return toEstate(data as EstateRow);
  }

  /**
   * Reads the owner's estate_members row via the caller's own session
   * client — estate_members_select_fellow_members RLS already lets any
   * accepted member (executor/helper included) read every membership row
   * for their estate, so no privileged/service-role lookup is needed here.
   */
  async getOwnerEmail(estateId: string): Promise<string> {
    const { data, error } = await this.supabase
      .from("estate_members")
      .select("invite_email")
      .eq("estate_id", estateId)
      .eq("role", "owner")
      .single();
    if (error) throw error;
    return (data as { invite_email: string }).invite_email;
  }
}
