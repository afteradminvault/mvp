import { getSodium } from "./sodium";

/**
 * CLIENT-ONLY — see sodium.ts.
 *
 * Argon2id key derivation, used to turn a person's account password into a
 * symmetric wrapping key (docs/SECURITY_ARCHITECTURE.md §1.1). Parameters
 * are OPSLIMIT_MODERATE / MEMLIMIT_MODERATE (~3 iterations, 256 MiB) —
 * INTERACTIVE is tuned for high-frequency operations like login and is too
 * weak for a key that protects the vault long-term; SENSITIVE (1 GiB) risks
 * OOM/hangs on memory-constrained mobile browsers running Argon2id via WASM.
 * MODERATE is libsodium's own documented recommendation for browser-based
 * password hashing and is what this module standardizes on for every
 * password-derived wrapping key in the system (Owner's VK wrap, and an
 * Executor/Helper's own private-key wrap — see vault-key-hierarchy.ts).
 *
 * This choice is re-tunable later without breaking existing data: only the
 * wrapping key changes if parameters change, not the VK/DEK it wraps, and
 * digital_vault_items.key_version already exists for this (Database Schema
 * §4.2) — re-deriving+re-wrapping is the same operation already required on
 * a password change (Security Architecture §1.3).
 */

export async function generateKdfSalt(): Promise<Uint8Array> {
  const sodium = await getSodium();
  return sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES);
}

export async function deriveWrappingKey(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const sodium = await getSodium();
  if (salt.length !== sodium.crypto_pwhash_SALTBYTES) {
    throw new Error(`KDF salt must be ${sodium.crypto_pwhash_SALTBYTES} bytes.`);
  }
  return sodium.crypto_pwhash(
    32,
    password,
    salt,
    sodium.crypto_pwhash_OPSLIMIT_MODERATE,
    sodium.crypto_pwhash_MEMLIMIT_MODERATE,
    sodium.crypto_pwhash_ALG_ARGON2ID13,
  );
}
