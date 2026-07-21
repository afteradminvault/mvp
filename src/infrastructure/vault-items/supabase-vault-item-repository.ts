import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CreateVaultItemInput,
  DigitalVaultItem,
  RotateVaultItemInput,
  VaultItemRepository,
  VaultItemType,
} from "@/domain/vault-items/ports";
import { fromByteaColumn, toByteaColumn } from "@/infrastructure/supabase/bytea-hex";

interface VaultItemRow {
  id: string;
  digital_asset_id: string;
  item_type: VaultItemType;
  ciphertext: string;
  encryption_iv: string;
  wrapped_data_key: string;
  key_version: number;
  created_at: string;
  updated_at: string;
}

function toVaultItem(row: VaultItemRow): DigitalVaultItem {
  return {
    id: row.id,
    digitalAssetId: row.digital_asset_id,
    itemType: row.item_type,
    ciphertext: fromByteaColumn(row.ciphertext) as string,
    encryptionIv: fromByteaColumn(row.encryption_iv) as string,
    wrappedDataKey: fromByteaColumn(row.wrapped_data_key) as string,
    keyVersion: row.key_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Concrete adapter against Supabase. RLS (digital_vault_items_* policies,
 * supabase/migrations/20260719120100_rls_policies.sql) already fully gates
 * every operation here — Owner read/write always, Executor read-only and
 * only once estates.status = 'active_executor' — so this repository is a
 * plain CRUD adapter with no app-layer role logic of its own, unlike
 * SupabaseVaultKeyRepository.
 */
export class SupabaseVaultItemRepository implements VaultItemRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async createItem(assetId: string, input: CreateVaultItemInput): Promise<DigitalVaultItem> {
    const { data, error } = await this.supabase
      .from("digital_vault_items")
      .insert({
        digital_asset_id: assetId,
        item_type: input.itemType,
        ciphertext: toByteaColumn(input.ciphertext),
        encryption_iv: toByteaColumn(input.encryptionIv),
        wrapped_data_key: toByteaColumn(input.wrappedDataKey),
        ...(input.keyVersion !== undefined ? { key_version: input.keyVersion } : {}),
      })
      .select("*")
      .single();
    if (error) throw error;
    return toVaultItem(data as VaultItemRow);
  }

  async listItems(assetId: string): Promise<DigitalVaultItem[]> {
    const { data, error } = await this.supabase
      .from("digital_vault_items")
      .select("*")
      .eq("digital_asset_id", assetId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data as VaultItemRow[]).map(toVaultItem);
  }

  async getItem(itemId: string): Promise<DigitalVaultItem | null> {
    const { data, error } = await this.supabase
      .from("digital_vault_items")
      .select("*")
      .eq("id", itemId)
      .maybeSingle();
    if (error) throw error;
    return data ? toVaultItem(data as VaultItemRow) : null;
  }

  async rotateItem(itemId: string, input: RotateVaultItemInput): Promise<DigitalVaultItem> {
    const { data, error } = await this.supabase
      .from("digital_vault_items")
      .update({
        ciphertext: toByteaColumn(input.ciphertext),
        encryption_iv: toByteaColumn(input.encryptionIv),
        wrapped_data_key: toByteaColumn(input.wrappedDataKey),
      })
      .eq("id", itemId)
      .select("*")
      .single();
    if (error) throw error;
    return toVaultItem(data as VaultItemRow);
  }

  async deleteItem(itemId: string): Promise<void> {
    const { error } = await this.supabase.from("digital_vault_items").delete().eq("id", itemId);
    if (error) throw error;
  }
}
