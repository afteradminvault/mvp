/**
 * Vault item domain contracts. Framework-free, same rationale as the other
 * ports.ts files. Every string field here is hex-encoded ciphertext/IV/
 * wrapped-key material (see src/crypto/encoding.ts) — this layer never
 * decodes or interprets it, only passes it through to storage. No
 * plaintext ever reaches this file; it doesn't run client-side.
 */

export type VaultItemType = "password" | "recovery_code" | "security_question" | "note" | "seed_phrase" | "other";

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
