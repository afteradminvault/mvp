import { getSodium } from "./sodium";

/**
 * CLIENT-ONLY — see sodium.ts.
 *
 * X25519 keypairs (crypto_box_keypair) and sealed-box encryption
 * (crypto_box_seal), used only for wrapping a copy of the estate's Vault
 * Key for an Executor or Backup Executor (docs/SECURITY_ARCHITECTURE.md
 * §1.1's "wrapping keys" layer). Sealed-box is the right primitive here
 * specifically because the Owner wrapping a VK copy for a member needs no
 * shared secret, no prior handshake, and no keypair of their own — anyone
 * holding the recipient's public key can seal to them, and only the
 * recipient's private key can open it. It's also randomized (an ephemeral
 * keypair is generated internally per call), which is why there is no
 * known-answer test for sealForRecipient/unsealAsRecipient below — only
 * round-trip and tamper/wrong-key tests are meaningful for a
 * non-deterministic primitive.
 */

export interface KeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export async function generateKeyPair(): Promise<KeyPair> {
  const sodium = await getSodium();
  const { publicKey, privateKey } = sodium.crypto_box_keypair();
  return { publicKey, privateKey };
}

export async function sealForRecipient(
  plaintext: Uint8Array,
  recipientPublicKey: Uint8Array,
): Promise<Uint8Array> {
  const sodium = await getSodium();
  if (recipientPublicKey.length !== sodium.crypto_box_PUBLICKEYBYTES) {
    throw new Error(`Recipient public key must be ${sodium.crypto_box_PUBLICKEYBYTES} bytes.`);
  }
  return sodium.crypto_box_seal(plaintext, recipientPublicKey);
}

export async function unsealAsRecipient(sealed: Uint8Array, recipientKeyPair: KeyPair): Promise<Uint8Array> {
  const sodium = await getSodium();
  try {
    return sodium.crypto_box_seal_open(sealed, recipientKeyPair.publicKey, recipientKeyPair.privateKey);
  } catch {
    throw new Error("Unseal failed: wrong keypair, or the sealed box was tampered with.");
  }
}
