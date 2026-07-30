import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExecutorKeyRecoveryMaterial, KeyRecoveryRepository } from "@/domain/key-recovery/ports";
import { fromByteaColumn } from "@/infrastructure/supabase/bytea-hex";

export class SupabaseKeyRecoveryRepository implements KeyRecoveryRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async getExecutorKeyRecoveryMaterial(estateId: string, userId: string): Promise<ExecutorKeyRecoveryMaterial | null> {
    const { data: memberRow, error: memberError } = await this.supabase
      .from("case_members")
      .select("wrapped_vault_key")
      .eq("case_id", estateId)
      .eq("user_id", userId)
      .eq("role", "executor")
      .eq("invite_status", "accepted")
      .maybeSingle();
    if (memberError) throw memberError;
    if (!memberRow || memberRow.wrapped_vault_key === null) return null;

    const { data: userRow, error: userError } = await this.supabase
      .from("users")
      .select("public_key, wrapped_private_key, kdf_salt")
      .eq("id", userId)
      .maybeSingle();
    if (userError) throw userError;
    if (!userRow || userRow.public_key === null || userRow.wrapped_private_key === null || userRow.kdf_salt === null) {
      return null;
    }

    return {
      wrappedVaultKey: fromByteaColumn(memberRow.wrapped_vault_key as string)!,
      publicKey: fromByteaColumn(userRow.public_key as string)!,
      wrappedPrivateKey: fromByteaColumn(userRow.wrapped_private_key as string)!,
      kdfSalt: fromByteaColumn(userRow.kdf_salt as string)!,
    };
  }
}
