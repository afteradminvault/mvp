import type { SupabaseClient } from "@supabase/supabase-js";
import type { InitializeVaultKeyInput, OwnerVaultKeyState, VaultKeyRepository } from "@/domain/vault-key/ports";
import { fromByteaColumn, toByteaColumn } from "@/infrastructure/supabase/bytea-hex";

/**
 * Concrete adapter against Supabase. Reads distinguish "you're not the
 * estate's owner" from "you are, but the vault isn't initialized yet" —
 * both would otherwise look like "no row found," but the route needs to
 * tell an Owner "set up your vault" from a non-Owner "not authorized."
 * Writes go through the initialize_owner_vault_key() RPC (Milestone 0's
 * established pattern for estate_members mutations — see
 * supabase/migrations/20260721000100_vault_key_bootstrap.sql), which
 * enforces the one-time invariant at the database layer, not just here.
 */
export class SupabaseVaultKeyRepository implements VaultKeyRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async getOwnerVaultKeyState(estateId: string): Promise<OwnerVaultKeyState> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) {
      throw new Error("must be authenticated to access a vault key");
    }

    const { data: memberRow, error: memberError } = await this.supabase
      .from("estate_members")
      .select("role, wrapped_vault_key")
      .eq("estate_id", estateId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (memberError) throw memberError;
    if (!memberRow || memberRow.role !== "owner") {
      throw new Error("only the estate owner can access this estate's vault key");
    }

    const { data: userRow, error: userError } = await this.supabase
      .from("users")
      .select("kdf_salt")
      .eq("id", user.id)
      .single();
    if (userError) throw userError;

    return {
      wrappedVaultKey: fromByteaColumn(memberRow.wrapped_vault_key as string | null),
      kdfSalt: fromByteaColumn(userRow.kdf_salt as string | null),
    };
  }

  async initializeOwnerVaultKey(estateId: string, input: InitializeVaultKeyInput): Promise<OwnerVaultKeyState> {
    const { error } = await this.supabase.rpc("initialize_owner_vault_key", {
      p_estate_id: estateId,
      p_wrapped_vault_key: toByteaColumn(input.wrappedVaultKey),
      ...(input.kdfSalt !== undefined ? { p_kdf_salt: toByteaColumn(input.kdfSalt) } : {}),
    });
    if (error) throw error;

    return this.getOwnerVaultKeyState(estateId);
  }
}
