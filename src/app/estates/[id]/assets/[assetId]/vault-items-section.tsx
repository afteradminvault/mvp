"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useVaultSession } from "../../vault-session-context";
import { AddVaultItemForm } from "./add-vault-item-form";
import { VaultItemRow } from "./vault-item-row";

interface DecryptedItem {
  id: string;
  itemType: string;
  value: string;
}

interface RawVaultItem {
  id: string;
  itemType: string;
  ciphertext: string;
  encryptionIv: string;
  wrappedDataKey: string;
}

export function VaultItemsSection({ estateId, assetId }: { estateId: string; assetId: string }) {
  const { vaultKey, unlock, isUnlocking, error: unlockError } = useVaultSession();
  const [password, setPassword] = useState("");
  const [items, setItems] = useState<DecryptedItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoadingItems, setIsLoadingItems] = useState(false);

  const loadAndDecrypt = useCallback(async () => {
    if (!vaultKey) return;
    setIsLoadingItems(true);
    setLoadError(null);
    try {
      const { hexToBytes } = await import("@/crypto/encoding");
      const { unpackEncryptedPayload } = await import("@/crypto/wire-format");
      const { unwrapDataEncryptionKey, decryptVaultItemContent } = await import("@/crypto/vault-key-hierarchy");

      const response = await fetch(`/api/estates/${estateId}/assets/${assetId}/vault-items`);
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Could not load vault items.");
      }

      const decrypted: DecryptedItem[] = [];
      for (const raw of result.items as RawVaultItem[]) {
        const packedWrappedDek = await hexToBytes(raw.wrappedDataKey);
        const wrappedDek = await unpackEncryptedPayload(packedWrappedDek);
        const dek = await unwrapDataEncryptionKey(wrappedDek, vaultKey);
        const ciphertext = await hexToBytes(raw.ciphertext);
        const nonce = await hexToBytes(raw.encryptionIv);
        const plaintextBytes = await decryptVaultItemContent({ ciphertext, nonce }, dek);
        decrypted.push({ id: raw.id, itemType: raw.itemType, value: new TextDecoder().decode(plaintextBytes) });
      }
      setItems(decrypted);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not decrypt vault items.");
    } finally {
      setIsLoadingItems(false);
    }
  }, [vaultKey, estateId, assetId]);

  useEffect(() => {
    if (vaultKey) {
      // Fetch-and-decrypt-on-unlock: a legitimate data-fetching effect
      // reacting to the VK becoming available, not derived render state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadAndDecrypt();
    } else {
      setItems(null);
    }
  }, [vaultKey, loadAndDecrypt]);

  async function handleUnlockSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await unlock(estateId, password, "family");
      setPassword("");
    } catch {
      // Error already surfaced via the vault session context's own state.
    }
  }

  if (!vaultKey) {
    return (
      <div className="rounded border border-gray-300 p-4">
        <h2 className="mb-2 text-lg font-medium">Vault</h2>
        <p className="mb-4 text-sm text-gray-600">
          Enter your account password to unlock this estate&apos;s vault for this browser session. Nothing is
          stored anywhere — the key exists only in this tab&apos;s memory and you&apos;ll need to unlock again
          after leaving.
        </p>
        <form onSubmit={handleUnlockSubmit} className="flex flex-col gap-3">
          <input
            type="password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Account password"
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          />
          {unlockError && <p className="text-sm text-red-600">{unlockError}</p>}
          <button
            type="submit"
            disabled={isUnlocking}
            className="w-fit rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {isUnlocking ? "Unlocking..." : "Unlock vault"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="rounded border border-gray-300 p-4">
      <h2 className="mb-4 text-lg font-medium">Vault</h2>
      {isLoadingItems && <p className="text-sm text-gray-600">Decrypting...</p>}
      {loadError && <p className="text-sm text-red-600">{loadError}</p>}
      {items && items.length === 0 && <p className="mb-4 text-sm text-gray-600">No vault items yet.</p>}
      {items && items.length > 0 && (
        <ul className="mb-4 flex flex-col gap-3">
          {items.map((item) => (
            <VaultItemRow
              key={item.id}
              estateId={estateId}
              assetId={assetId}
              item={item}
              vaultKey={vaultKey}
              onChanged={loadAndDecrypt}
            />
          ))}
        </ul>
      )}
      <AddVaultItemForm estateId={estateId} assetId={assetId} vaultKey={vaultKey} onAdded={loadAndDecrypt} />
    </div>
  );
}
