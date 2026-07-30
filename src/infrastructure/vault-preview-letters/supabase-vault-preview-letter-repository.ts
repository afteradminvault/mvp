import type { SupabaseClient } from "@supabase/supabase-js";
import type { VaultItemType } from "@/domain/vault-items/ports";
import type { VaultPreviewLetter, VaultPreviewLetterRepository } from "@/domain/vault-preview-letters/ports";

interface VaultPreviewLetterRow {
  id: string;
  estate_id: string;
  generated_by_user_id: string;
  item_type_summary: Partial<Record<VaultItemType, number>>;
  generated_at: string;
}

function toVaultPreviewLetter(row: VaultPreviewLetterRow): VaultPreviewLetter {
  return {
    id: row.id,
    estateId: row.estate_id,
    generatedByUserId: row.generated_by_user_id,
    itemTypeSummary: row.item_type_summary,
    generatedAt: row.generated_at,
  };
}

/** Concrete adapter against Supabase. Plain RLS-gated insert — no RPC, see the migration's own comment on why none is needed. */
export class SupabaseVaultPreviewLetterRepository implements VaultPreviewLetterRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async createLetter(
    estateId: string,
    generatedByUserId: string,
    itemTypeSummary: Partial<Record<VaultItemType, number>>,
  ): Promise<VaultPreviewLetter> {
    const { data, error } = await this.supabase
      .from("vault_preview_letters")
      .insert({
        estate_id: estateId,
        generated_by_user_id: generatedByUserId,
        item_type_summary: itemTypeSummary,
      })
      .select("*")
      .single();
    if (error) throw error;
    return toVaultPreviewLetter(data as VaultPreviewLetterRow);
  }

  async listLetters(estateId: string): Promise<VaultPreviewLetter[]> {
    const { data, error } = await this.supabase
      .from("vault_preview_letters")
      .select("*")
      .eq("estate_id", estateId)
      .order("generated_at", { ascending: false });
    if (error) throw error;
    return (data as VaultPreviewLetterRow[]).map(toVaultPreviewLetter);
  }

  async getLetter(letterId: string): Promise<VaultPreviewLetter | null> {
    const { data, error } = await this.supabase
      .from("vault_preview_letters")
      .select("*")
      .eq("id", letterId)
      .maybeSingle();
    if (error) throw error;
    return data ? toVaultPreviewLetter(data as VaultPreviewLetterRow) : null;
  }
}
