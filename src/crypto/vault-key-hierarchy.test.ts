import { describe, expect, it } from "vitest";
import { generateKeyPair } from "./asymmetric";
import { generateKdfSalt } from "./kdf";
import {
  decryptVaultItemContent,
  deriveOwnerWrappingKey,
  derivePrivateKeyWrappingKey,
  encryptVaultItemContent,
  generateDataEncryptionKey,
  generateVaultKey,
  unwrapDataEncryptionKey,
  unwrapPrivateKeyForSelf,
  unwrapVaultKeyAsMember,
  unwrapVaultKeyAsOwner,
  wrapDataEncryptionKey,
  wrapPrivateKeyForSelf,
  wrapVaultKeyForMember,
  wrapVaultKeyForOwner,
} from "./vault-key-hierarchy";

/**
 * End-to-end simulation of docs/SECURITY_ARCHITECTURE.md §1.1/§1.2: an
 * Owner creates a vault item, an Executor is nominated and gets a wrapped
 * VK copy, and — simulating the post-death key-recovery flow — the
 * Executor independently recovers the same plaintext using only their own
 * password. Nothing here touches Supabase; every "server" value below is
 * just the opaque bytes this module would hand to persistence.
 */
describe("vault key hierarchy: Owner setup through Executor key recovery", () => {
  it("lets an Executor recover the exact plaintext an Owner encrypted, using only their own password", async () => {
    // Runs Argon2id (MODERATE) three times (Owner derive, Executor derive,
    // Executor re-derive on "recovery") — slower than vitest's 5s default,
    // not a bug.
    const ownerPassword = "diane-super-secret-passphrase-2026!";
    const executorPassword = "marcus-different-passphrase-2026!";
    const plaintext = new TextEncoder().encode("chase-checking-1234: hunter2-but-better");

    // --- Owner: create the estate's Vault Key and their own wrapped copy ---
    const vaultKey = await generateVaultKey();
    const ownerSalt = await generateKdfSalt();
    const ownerWrappingKey = await deriveOwnerWrappingKey(ownerPassword, ownerSalt);
    const ownerWrappedVaultKey = await wrapVaultKeyForOwner(vaultKey, ownerWrappingKey);

    // --- Owner: create one vault item ---
    const dek = await generateDataEncryptionKey();
    const encryptedItem = await encryptVaultItemContent(plaintext, dek);
    const wrappedDek = await wrapDataEncryptionKey(dek, vaultKey);

    // --- Executor: at invite-acceptance time, generates their own keypair
    //     and wraps the private key under their own password ---
    const executorKeyPair = await generateKeyPair();
    const executorSalt = await generateKdfSalt();
    const executorPasswordKey = await derivePrivateKeyWrappingKey(executorPassword, executorSalt);
    const wrappedExecutorPrivateKey = await wrapPrivateKeyForSelf(
      executorKeyPair.privateKey,
      executorPasswordKey,
    );

    // --- Owner: once the Executor's public key is available, wraps a VK
    //     copy for them (docs/API_SPECIFICATION.md §3, wrap-key-share) ---
    const sealedVaultKeyForExecutor = await wrapVaultKeyForMember(vaultKey, executorKeyPair.publicKey);

    // Sanity check: the Owner can still read their own item normally.
    const ownerRecoveredVaultKey = await unwrapVaultKeyAsOwner(ownerWrappedVaultKey, ownerWrappingKey);
    expect(ownerRecoveredVaultKey).toEqual(vaultKey);

    // --- Post-death key recovery (Security Architecture §1.2): the
    //     Executor's client, from just their own password, must recover
    //     the same plaintext the Owner encrypted. ---
    const recoveredExecutorPasswordKey = await derivePrivateKeyWrappingKey(executorPassword, executorSalt);
    const recoveredExecutorPrivateKey = await unwrapPrivateKeyForSelf(
      wrappedExecutorPrivateKey,
      recoveredExecutorPasswordKey,
    );
    const recoveredExecutorKeyPair = {
      publicKey: executorKeyPair.publicKey,
      privateKey: recoveredExecutorPrivateKey,
    };
    const recoveredVaultKey = await unwrapVaultKeyAsMember(sealedVaultKeyForExecutor, recoveredExecutorKeyPair);
    expect(recoveredVaultKey).toEqual(vaultKey);

    const recoveredDek = await unwrapDataEncryptionKey(wrappedDek, recoveredVaultKey);
    expect(recoveredDek).toEqual(dek);

    const recoveredPlaintext = await decryptVaultItemContent(encryptedItem, recoveredDek);
    expect(recoveredPlaintext).toEqual(plaintext);
  }, 20_000);

  it("does not let the Owner's own wrapping key unwrap the Executor's private key, or vice versa", async () => {
    const vaultKey = await generateVaultKey();
    const ownerSalt = await generateKdfSalt();
    const ownerWrappingKey = await deriveOwnerWrappingKey("owner-password", ownerSalt);

    const executorKeyPair = await generateKeyPair();
    const executorSalt = await generateKdfSalt();
    const executorPasswordKey = await derivePrivateKeyWrappingKey("executor-password", executorSalt);
    const wrappedExecutorPrivateKey = await wrapPrivateKeyForSelf(
      executorKeyPair.privateKey,
      executorPasswordKey,
    );

    // The Owner's own wrapping key must not unwrap the Executor's private key.
    await expect(unwrapPrivateKeyForSelf(wrappedExecutorPrivateKey, ownerWrappingKey)).rejects.toThrow();

    // A wrong VK-wrapping ciphertext must not be openable by an unrelated wrapping key either.
    const ownerWrappedVaultKey = await wrapVaultKeyForOwner(vaultKey, ownerWrappingKey);
    await expect(unwrapVaultKeyAsOwner(ownerWrappedVaultKey, executorPasswordKey)).rejects.toThrow();
  });

  it("does not let a Backup Executor's keypair unwrap a VK copy sealed for the primary Executor", async () => {
    // Redundancy model resolution: Owner + primary Executor + Backup
    // Executor each get an independent sealed copy — one member's keypair
    // must never open another member's copy.
    const vaultKey = await generateVaultKey();
    const primaryExecutor = await generateKeyPair();
    const backupExecutor = await generateKeyPair();

    const sealedForPrimary = await wrapVaultKeyForMember(vaultKey, primaryExecutor.publicKey);
    const sealedForBackup = await wrapVaultKeyForMember(vaultKey, backupExecutor.publicKey);

    await expect(unwrapVaultKeyAsMember(sealedForPrimary, backupExecutor)).rejects.toThrow();
    await expect(unwrapVaultKeyAsMember(sealedForBackup, primaryExecutor)).rejects.toThrow();

    // Each member's own copy still works independently.
    expect(await unwrapVaultKeyAsMember(sealedForPrimary, primaryExecutor)).toEqual(vaultKey);
    expect(await unwrapVaultKeyAsMember(sealedForBackup, backupExecutor)).toEqual(vaultKey);
  });
});
