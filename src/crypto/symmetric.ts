import { getSodium } from "./sodium";

/**
 * CLIENT-ONLY — see sodium.ts.
 *
 * XChaCha20-Poly1305 (IETF variant), used for every symmetric encryption
 * layer in the key hierarchy — item content under a DEK, a DEK under the
 * estate's VK, and a VK or private key under a password-derived wrapping
 * key (docs/SECURITY_ARCHITECTURE.md §1.1). One primitive, reused, rather
 * than AES-256-GCM as originally sketched in §1.1 — see this feature's
 * written proposal for why: libsodium's AES-256-GCM (crypto_aead_aes256gcm)
 * is hardware-acceleration-only and unavailable on many browsers/devices
 * running via WASM, and XChaCha20-Poly1305's 192-bit random nonce has no
 * meaningful collision risk at this system's message volume, unlike
 * AES-GCM/ChaCha20-Poly1305's 96-bit nonce — important here because every
 * item is encrypted independently, client-side, with no central nonce
 * counter to coordinate.
 */

export interface EncryptedPayload {
  ciphertext: Uint8Array;
  nonce: Uint8Array;
}

export async function generateSymmetricKey(): Promise<Uint8Array> {
  const sodium = await getSodium();
  return sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES);
}

export async function encryptSymmetric(
  plaintext: Uint8Array,
  key: Uint8Array,
): Promise<EncryptedPayload> {
  const sodium = await getSodium();
  if (key.length !== sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES) {
    throw new Error(`Key must be ${sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES} bytes.`);
  }
  const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    plaintext,
    null,
    null,
    nonce,
    key,
  );
  return { ciphertext, nonce };
}

export async function decryptSymmetric(
  payload: EncryptedPayload,
  key: Uint8Array,
): Promise<Uint8Array> {
  const sodium = await getSodium();
  try {
    return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      payload.ciphertext,
      null,
      payload.nonce,
      key,
    );
  } catch {
    // libsodium throws on both malformed input and authentication failure —
    // normalized to one message so callers can't distinguish "wrong key"
    // from "tampered ciphertext" from a caught exception's shape.
    throw new Error("Decryption failed: wrong key, wrong nonce, or the ciphertext was tampered with.");
  }
}
