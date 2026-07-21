import { getSodium } from "./sodium";
import type { EncryptedPayload } from "./symmetric";

/**
 * CLIENT-ONLY — see sodium.ts.
 *
 * Some columns this system writes to hold exactly one bytea value
 * (estate_members.wrapped_vault_key, users.wrapped_private_key,
 * digital_vault_items.wrapped_data_key), but an EncryptedPayload is a
 * ciphertext *and* a nonce. Vault item content itself has two separate
 * columns (ciphertext, encryption_iv — Database Schema §4.2) and doesn't
 * need this; every other wrap in the key hierarchy does. Nonce-then-
 * ciphertext concatenation is a standard, unambiguous packing since the
 * nonce is always exactly crypto_aead_xchacha20poly1305_ietf_NPUBBYTES.
 */
export async function packEncryptedPayload(payload: EncryptedPayload): Promise<Uint8Array> {
  const packed = new Uint8Array(payload.nonce.length + payload.ciphertext.length);
  packed.set(payload.nonce, 0);
  packed.set(payload.ciphertext, payload.nonce.length);
  return packed;
}

export async function unpackEncryptedPayload(packed: Uint8Array): Promise<EncryptedPayload> {
  const sodium = await getSodium();
  const nonceLength = sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES;
  if (packed.length < nonceLength) {
    throw new Error("Packed payload is too short to contain a valid nonce.");
  }
  return {
    nonce: packed.slice(0, nonceLength),
    ciphertext: packed.slice(nonceLength),
  };
}
