import type {
  CreateVaultItemInput,
  DigitalVaultItem,
  RotateVaultItemInput,
  VaultItemRepository,
  VaultItemType,
} from "./ports";

export const VAULT_ITEM_TYPES: readonly VaultItemType[] = [
  "password",
  "crypto_seed_phrase",
  "bank_detail",
  "domain_login",
  "subscription",
  "brokerage_account",
  "custom",
];

// Generous enough for any realistic vault item (password, recovery code,
// note, seed phrase) while bounding pathological input — ~15KB of raw
// plaintext once decoded, which nothing in this product's scope needs
// more than.
export const MAX_HEX_FIELD_LENGTH = 30_000;

export class InvalidVaultItemInputError extends Error {}
export class VaultItemNotFoundError extends Error {}

const HEX_PATTERN = /^[0-9a-fA-F]+$/;

/**
 * Validates that a value is well-formed hex (the wire format for bytea —
 * see src/crypto/encoding.ts), not that it decrypts to anything in
 * particular. This is the one thing the server is allowed to check about
 * ciphertext/IV/wrapped-key fields: are they storable bytes, never what
 * they mean.
 */
function validateHexField(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new InvalidVaultItemInputError(`${fieldName} is required.`);
  }
  if (value.length % 2 !== 0 || !HEX_PATTERN.test(value)) {
    throw new InvalidVaultItemInputError(`${fieldName} must be a hex-encoded string.`);
  }
  if (value.length > MAX_HEX_FIELD_LENGTH) {
    throw new InvalidVaultItemInputError(`${fieldName} exceeds the maximum allowed size.`);
  }
  return value;
}

function validateItemType(itemType: unknown): VaultItemType {
  if (typeof itemType !== "string" || !VAULT_ITEM_TYPES.includes(itemType as VaultItemType)) {
    throw new InvalidVaultItemInputError(`itemType must be one of: ${VAULT_ITEM_TYPES.join(", ")}.`);
  }
  return itemType as VaultItemType;
}

function validateKeyVersion(keyVersion: unknown): number | undefined {
  if (keyVersion === undefined) return undefined;
  if (!Number.isInteger(keyVersion) || (keyVersion as number) < 1) {
    throw new InvalidVaultItemInputError("keyVersion must be a positive integer.");
  }
  return keyVersion as number;
}

/**
 * Orchestrates vault-item use cases. No crypto happens here — see
 * src/crypto/vault-key-hierarchy.ts, which runs client-side only. This
 * service's entire job is validating that the opaque fields are
 * well-formed before storage, never touching their meaning.
 */
export class VaultItemService {
  constructor(private readonly repository: VaultItemRepository) {}

  async createItem(assetId: string, input: CreateVaultItemInput): Promise<DigitalVaultItem> {
    const itemType = validateItemType(input.itemType);
    const ciphertext = validateHexField(input.ciphertext, "ciphertext");
    const encryptionIv = validateHexField(input.encryptionIv, "encryptionIv");
    const wrappedDataKey = validateHexField(input.wrappedDataKey, "wrappedDataKey");
    const keyVersion = validateKeyVersion(input.keyVersion);

    return this.repository.createItem(assetId, {
      itemType,
      ciphertext,
      encryptionIv,
      wrappedDataKey,
      keyVersion,
    });
  }

  async listItems(assetId: string): Promise<DigitalVaultItem[]> {
    return this.repository.listItems(assetId);
  }

  async getItem(itemId: string): Promise<DigitalVaultItem> {
    const item = await this.repository.getItem(itemId);
    if (!item) {
      throw new VaultItemNotFoundError("Vault item not found, or you don't have access to it.");
    }
    return item;
  }

  async rotateItem(itemId: string, input: RotateVaultItemInput): Promise<DigitalVaultItem> {
    await this.getItem(itemId);
    const ciphertext = validateHexField(input.ciphertext, "ciphertext");
    const encryptionIv = validateHexField(input.encryptionIv, "encryptionIv");
    const wrappedDataKey = validateHexField(input.wrappedDataKey, "wrappedDataKey");

    return this.repository.rotateItem(itemId, { ciphertext, encryptionIv, wrappedDataKey });
  }

  async deleteItem(itemId: string): Promise<void> {
    await this.getItem(itemId);
    return this.repository.deleteItem(itemId);
  }
}
