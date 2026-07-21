import { getSodium } from "./sodium";

/**
 * CLIENT-ONLY — see sodium.ts. Base64 is the wire/storage representation
 * for the bytea columns this module's output eventually lands in
 * (digital_vault_items.ciphertext/encryption_iv/wrapped_data_key,
 * estate_members.wrapped_vault_key, users.wrapped_private_key/public_key —
 * see docs/DATABASE_SCHEMA.md and the schema-adjustment proposal for this
 * feature). Every other module in src/crypto/ works in Uint8Array; these
 * helpers are only for the boundary to/from persistence.
 */
export async function bytesToBase64(bytes: Uint8Array): Promise<string> {
  const sodium = await getSodium();
  return sodium.to_base64(bytes, sodium.base64_variants.ORIGINAL);
}

export async function base64ToBytes(base64: string): Promise<Uint8Array> {
  const sodium = await getSodium();
  return sodium.from_base64(base64, sodium.base64_variants.ORIGINAL);
}
