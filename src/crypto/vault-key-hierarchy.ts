import { decryptSymmetric, encryptSymmetric, generateSymmetricKey, type EncryptedPayload } from "./symmetric";
import { sealForRecipient, unsealAsRecipient, type KeyPair } from "./asymmetric";
import { deriveWrappingKey } from "./kdf";

/**
 * CLIENT-ONLY — see sodium.ts.
 *
 * The envelope-encryption key hierarchy from docs/SECURITY_ARCHITECTURE.md
 * §1, named to match that document exactly (DEK, VK, owner/member wrapping)
 * so the two stay easy to cross-reference. Composes symmetric.ts /
 * asymmetric.ts / kdf.ts — this file adds no new cryptographic primitives,
 * only names the operations the design calls for.
 *
 * Not wired to any UI, Route Handler, or table yet (Milestone 1 step 1) —
 * that's steps 4 (vault item CRUD) and 5 (nomination flow) of this
 * milestone, per docs/DEVELOPMENT_ROADMAP.md.
 */

// ---------------------------------------------------------------------------
// Per-item Data Encryption Key (DEK) — one per digital_vault_items row.
// ---------------------------------------------------------------------------

export const generateDataEncryptionKey = generateSymmetricKey;

export async function encryptVaultItemContent(
  plaintext: Uint8Array,
  dek: Uint8Array,
): Promise<EncryptedPayload> {
  return encryptSymmetric(plaintext, dek);
}

export async function decryptVaultItemContent(
  payload: EncryptedPayload,
  dek: Uint8Array,
): Promise<Uint8Array> {
  return decryptSymmetric(payload, dek);
}

// ---------------------------------------------------------------------------
// Per-estate Vault Key (VK) — wraps every item's DEK.
// ---------------------------------------------------------------------------

export const generateVaultKey = generateSymmetricKey;

export async function wrapDataEncryptionKey(
  dek: Uint8Array,
  vaultKey: Uint8Array,
): Promise<EncryptedPayload> {
  return encryptSymmetric(dek, vaultKey);
}

export async function unwrapDataEncryptionKey(
  wrapped: EncryptedPayload,
  vaultKey: Uint8Array,
): Promise<Uint8Array> {
  return decryptSymmetric(wrapped, vaultKey);
}

// ---------------------------------------------------------------------------
// Owner wrapping key — Argon2id-derived directly from the Planner's account
// password. Wraps the Owner's own copy of the VK directly (no keypair).
// ---------------------------------------------------------------------------

export async function deriveOwnerWrappingKey(password: string, salt: Uint8Array): Promise<Uint8Array> {
  return deriveWrappingKey(password, salt);
}

export async function wrapVaultKeyForOwner(
  vaultKey: Uint8Array,
  ownerWrappingKey: Uint8Array,
): Promise<EncryptedPayload> {
  return encryptSymmetric(vaultKey, ownerWrappingKey);
}

export async function unwrapVaultKeyAsOwner(
  wrapped: EncryptedPayload,
  ownerWrappingKey: Uint8Array,
): Promise<Uint8Array> {
  return decryptSymmetric(wrapped, ownerWrappingKey);
}

// ---------------------------------------------------------------------------
// Executor/Backup-Executor wrapping — an X25519 keypair generated on their
// device at invite-acceptance time. The private key is wrapped under their
// own password-derived key (same KDF as the Owner path) so it never leaves
// their device in plaintext; the public key lets anyone (the Owner) seal a
// VK copy to them with no shared secret.
// ---------------------------------------------------------------------------

export async function derivePrivateKeyWrappingKey(password: string, salt: Uint8Array): Promise<Uint8Array> {
  return deriveWrappingKey(password, salt);
}

export async function wrapPrivateKeyForSelf(
  privateKey: Uint8Array,
  passwordWrappingKey: Uint8Array,
): Promise<EncryptedPayload> {
  return encryptSymmetric(privateKey, passwordWrappingKey);
}

export async function unwrapPrivateKeyForSelf(
  wrapped: EncryptedPayload,
  passwordWrappingKey: Uint8Array,
): Promise<Uint8Array> {
  return decryptSymmetric(wrapped, passwordWrappingKey);
}

export async function wrapVaultKeyForMember(
  vaultKey: Uint8Array,
  memberPublicKey: Uint8Array,
): Promise<Uint8Array> {
  return sealForRecipient(vaultKey, memberPublicKey);
}

/**
 * The key-recovery step (docs/SECURITY_ARCHITECTURE.md §1.2): once
 * `estates.status = 'active_executor'` (app-layer gate, enforced
 * server-side before this ciphertext is ever served — not this function's
 * job), the Executor's client uses their own unwrapped keypair to recover
 * the estate's VK.
 */
export async function unwrapVaultKeyAsMember(sealedVaultKey: Uint8Array, memberKeyPair: KeyPair): Promise<Uint8Array> {
  return unsealAsRecipient(sealedVaultKey, memberKeyPair);
}
