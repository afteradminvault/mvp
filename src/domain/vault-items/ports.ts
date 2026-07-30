/**
 * Vault item domain contracts. Framework-free, same rationale as the other
 * ports.ts files. Every string field here is hex-encoded ciphertext/IV/
 * wrapped-key material (see src/crypto/encoding.ts) — this layer never
 * decodes or interprets it, only passes it through to storage. No
 * plaintext ever reaches this file; it doesn't run client-side.
 */

/**
 * PRD v2 §3.5/Database Schema v2 §2.9's expanded 7-type set (US-3.1),
 * replacing v1's 6-value content-type list (password/recovery_code/
 * security_question/note/seed_phrase/other). Deliberately kept
 * asset-scoped (digital_asset_id unchanged) — only the type vocabulary
 * changed, not the scoping model; see supabase/migrations/
 * 20260731000000_vault_item_type_v2.sql for the exact old->new data
 * mapping this required.
 */
export type VaultItemType =
  | "password"
  | "crypto_seed_phrase"
  | "bank_detail"
  | "domain_login"
  | "subscription"
  | "brokerage_account"
  | "custom";

export interface DigitalVaultItem {
  id: string;
  digitalAssetId: string;
  itemType: VaultItemType;
  ciphertext: string;
  encryptionIv: string;
  wrappedDataKey: string;
  keyVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVaultItemInput {
  itemType: VaultItemType;
  ciphertext: string;
  encryptionIv: string;
  wrappedDataKey: string;
  keyVersion?: number;
}

export interface RotateVaultItemInput {
  ciphertext: string;
  encryptionIv: string;
  wrappedDataKey: string;
}

export interface VaultItemRepository {
  createItem(assetId: string, input: CreateVaultItemInput): Promise<DigitalVaultItem>;
  listItems(assetId: string): Promise<DigitalVaultItem[]>;
  getItem(itemId: string): Promise<DigitalVaultItem | null>;
  rotateItem(itemId: string, input: RotateVaultItemInput): Promise<DigitalVaultItem>;
  deleteItem(itemId: string): Promise<void>;
}
