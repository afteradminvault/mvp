import { getSodium } from "./sodium";

/**
 * CLIENT-ONLY — see sodium.ts.
 *
 * Hex is the actual wire representation for every `bytea` column this
 * module's output lands in (digital_vault_items.ciphertext/encryption_iv/
 * wrapped_data_key, estate_members.wrapped_vault_key,
 * users.wrapped_private_key/public_key) — PostgREST represents `bytea` as
 * hex strings (Postgres's own default `bytea_output = hex`), not base64,
 * both reading and writing. Base64 helpers are kept for any other
 * serialization need (e.g. embedding in a URL) but are not what the
 * Supabase repositories use for these columns.
 */
export async function bytesToHex(bytes: Uint8Array): Promise<string> {
  const sodium = await getSodium();
  return sodium.to_hex(bytes);
}

export async function hexToBytes(hex: string): Promise<Uint8Array> {
  const sodium = await getSodium();
  return sodium.from_hex(hex);
}

export async function bytesToBase64(bytes: Uint8Array): Promise<string> {
  const sodium = await getSodium();
  return sodium.to_base64(bytes, sodium.base64_variants.ORIGINAL);
}

export async function base64ToBytes(base64: string): Promise<Uint8Array> {
  const sodium = await getSodium();
  return sodium.from_base64(base64, sodium.base64_variants.ORIGINAL);
}
