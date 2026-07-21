"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

interface VaultSessionValue {
  /** Unwrapped Vault Key, held only in memory for this tab — never persisted anywhere. */
  vaultKey: Uint8Array | null;
  isUnlocking: boolean;
  error: string | null;
  unlock: (estateId: string, password: string) => Promise<void>;
  lock: () => void;
}

const VaultSessionContext = createContext<VaultSessionValue | null>(null);

export function VaultSessionProvider({ children }: { children: ReactNode }) {
  const [vaultKey, setVaultKey] = useState<Uint8Array | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unlock = useCallback(async (estateId: string, password: string) => {
    setIsUnlocking(true);
    setError(null);
    try {
      const { hexToBytes, bytesToHex } = await import("@/crypto/encoding");
      const { packEncryptedPayload, unpackEncryptedPayload } = await import("@/crypto/wire-format");
      const { generateKdfSalt } = await import("@/crypto/kdf");
      const {
        deriveOwnerWrappingKey,
        generateVaultKey,
        wrapVaultKeyForOwner,
        unwrapVaultKeyAsOwner,
      } = await import("@/crypto/vault-key-hierarchy");

      const stateResponse = await fetch(`/api/estates/${estateId}/vault-key`);
      const stateResult = await stateResponse.json();
      if (!stateResponse.ok) {
        throw new Error(stateResult.error ?? "Could not load vault key state.");
      }

      const { wrappedVaultKey, kdfSalt } = stateResult.vaultKey as {
        wrappedVaultKey: string | null;
        kdfSalt: string | null;
      };

      if (wrappedVaultKey === null) {
        // First time this estate's vault has ever been touched — bootstrap
        // a new Vault Key (docs/SECURITY_ARCHITECTURE.md §1.1).
        const isFirstEverKey = kdfSalt === null;
        const salt = isFirstEverKey ? await generateKdfSalt() : await hexToBytes(kdfSalt);
        const wrappingKey = await deriveOwnerWrappingKey(password, salt);
        const newVaultKey = await generateVaultKey();
        const wrapped = await wrapVaultKeyForOwner(newVaultKey, wrappingKey);
        const packed = await packEncryptedPayload(wrapped);

        const initResponse = await fetch(`/api/estates/${estateId}/vault-key`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            wrappedVaultKey: await bytesToHex(packed),
            ...(isFirstEverKey ? { kdfSalt: await bytesToHex(salt) } : {}),
          }),
        });
        const initResult = await initResponse.json();
        if (!initResponse.ok) {
          throw new Error(initResult.error ?? "Could not initialize the vault key.");
        }
        setVaultKey(newVaultKey);
        return;
      }

      if (kdfSalt === null) {
        throw new Error("Vault key exists but this account has no KDF salt on record — data inconsistency.");
      }
      const salt = await hexToBytes(kdfSalt);
      const wrappingKey = await deriveOwnerWrappingKey(password, salt);
      const packed = await hexToBytes(wrappedVaultKey);
      const unpacked = await unpackEncryptedPayload(packed);
      const recoveredVaultKey = await unwrapVaultKeyAsOwner(unpacked, wrappingKey);
      setVaultKey(recoveredVaultKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not unlock the vault. Check your password.");
      throw err;
    } finally {
      setIsUnlocking(false);
    }
  }, []);

  const lock = useCallback(() => {
    setVaultKey(null);
  }, []);

  const value = useMemo(
    () => ({ vaultKey, isUnlocking, error, unlock, lock }),
    [vaultKey, isUnlocking, error, unlock, lock],
  );

  return <VaultSessionContext.Provider value={value}>{children}</VaultSessionContext.Provider>;
}

export function useVaultSession(): VaultSessionValue {
  const context = useContext(VaultSessionContext);
  if (!context) {
    throw new Error("useVaultSession must be used within a VaultSessionProvider.");
  }
  return context;
}
