"use client";

import { useState, useTransition } from "react";

export function VaultItemRow({
  estateId,
  assetId,
  item,
  vaultKey,
  onChanged,
}: {
  estateId: string;
  assetId: string;
  item: { id: string; itemType: string; value: string };
  vaultKey: Uint8Array;
  onChanged: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftValue, setDraftValue] = useState(item.value);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleRotate() {
    setError(null);
    startTransition(async () => {
      try {
        const { bytesToHex } = await import("@/crypto/encoding");
        const { packEncryptedPayload } = await import("@/crypto/wire-format");
        const { generateDataEncryptionKey, encryptVaultItemContent, wrapDataEncryptionKey } = await import(
          "@/crypto/vault-key-hierarchy"
        );

        // A fresh DEK every rotation — never reuse the old one.
        const dek = await generateDataEncryptionKey();
        const encrypted = await encryptVaultItemContent(new TextEncoder().encode(draftValue), dek);
        const wrappedDek = await wrapDataEncryptionKey(dek, vaultKey);
        const packedWrappedDek = await packEncryptedPayload(wrappedDek);

        const response = await fetch(
          `/api/estates/${estateId}/assets/${assetId}/vault-items/${item.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ciphertext: await bytesToHex(encrypted.ciphertext),
              encryptionIv: await bytesToHex(encrypted.nonce),
              wrappedDataKey: await bytesToHex(packedWrappedDek),
            }),
          },
        );
        const result = await response.json();
        if (!response.ok) {
          setError(result.error ?? "Something went wrong.");
          return;
        }
        setIsEditing(false);
        onChanged();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Encryption failed.");
      }
    });
  }

  function handleDelete() {
    if (!window.confirm("Delete this vault item permanently? This is a hard delete — it cannot be undone.")) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/estates/${estateId}/assets/${assetId}/vault-items/${item.id}`, {
        method: "DELETE",
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      onChanged();
    });
  }

  return (
    <li className="rounded border border-gray-300 p-3">
      <p className="text-xs text-gray-600">{item.itemType}</p>
      {isEditing ? (
        <div className="mt-2 flex flex-col gap-2">
          <textarea
            value={draftValue}
            onChange={(event) => setDraftValue(event.target.value)}
            rows={3}
            className="rounded border border-gray-300 px-3 py-2 font-mono text-sm"
          />
          <div className="flex gap-2">
            <button
              onClick={handleRotate}
              disabled={isPending}
              className="rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {isPending ? "Saving..." : "Save new value"}
            </button>
            <button
              onClick={() => {
                setIsEditing(false);
                setDraftValue(item.value);
              }}
              className="text-sm underline"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-1 flex items-center justify-between gap-3">
          <p className="break-all font-mono text-sm">{item.value}</p>
          <div className="flex shrink-0 gap-3 text-sm">
            <button onClick={() => setIsEditing(true)} className="underline">
              Rotate
            </button>
            <button onClick={handleDelete} disabled={isPending} className="text-red-600 underline disabled:opacity-50">
              Delete
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </li>
  );
}
