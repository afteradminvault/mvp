"use client";

import { useState, useTransition, type FormEvent } from "react";

const ITEM_TYPES = [
  "password",
  "crypto_seed_phrase",
  "bank_detail",
  "domain_login",
  "subscription",
  "brokerage_account",
  "custom",
] as const;

export function AddVaultItemForm({
  estateId,
  assetId,
  vaultKey,
  onAdded,
}: {
  estateId: string;
  assetId: string;
  vaultKey: Uint8Array;
  onAdded: () => void;
}) {
  const [itemType, setItemType] = useState<(typeof ITEM_TYPES)[number]>("password");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const { bytesToHex } = await import("@/crypto/encoding");
        const { packEncryptedPayload } = await import("@/crypto/wire-format");
        const { generateDataEncryptionKey, encryptVaultItemContent, wrapDataEncryptionKey } = await import(
          "@/crypto/vault-key-hierarchy"
        );

        const dek = await generateDataEncryptionKey();
        const encrypted = await encryptVaultItemContent(new TextEncoder().encode(value), dek);
        const wrappedDek = await wrapDataEncryptionKey(dek, vaultKey);
        const packedWrappedDek = await packEncryptedPayload(wrappedDek);

        const response = await fetch(`/api/estates/${estateId}/assets/${assetId}/vault-items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itemType,
            ciphertext: await bytesToHex(encrypted.ciphertext),
            encryptionIv: await bytesToHex(encrypted.nonce),
            wrappedDataKey: await bytesToHex(packedWrappedDek),
          }),
        });
        const result = await response.json();
        if (!response.ok) {
          setError(result.error ?? "Something went wrong.");
          return;
        }
        setValue("");
        onAdded();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Encryption failed.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 border-t border-gray-200 pt-4">
      <h3 className="text-sm font-medium">Add a vault item</h3>
      <label className="flex flex-col gap-1 text-sm">
        Type
        <select
          value={itemType}
          onChange={(event) => setItemType(event.target.value as (typeof ITEM_TYPES)[number])}
          className="rounded border border-gray-300 px-3 py-2"
        >
          {ITEM_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Value
        <textarea
          required
          value={value}
          onChange={(event) => setValue(event.target.value)}
          rows={3}
          placeholder="Encrypted in your browser before it's sent — never stored or seen as plaintext by the server."
          className="rounded border border-gray-300 px-3 py-2 font-mono text-sm"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={isPending}
        className="w-fit rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {isPending ? "Encrypting..." : "Add item"}
      </button>
    </form>
  );
}
