"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { DigitalAsset, IntendedOutcome } from "@/domain/assets/ports";

const INTENDED_OUTCOMES: IntendedOutcome[] = ["close", "transfer", "memorialize", "ignore", "other"];

export function EditAssetForm({ estateId, asset }: { estateId: string; asset: DigitalAsset }) {
  const router = useRouter();
  const [customProviderName, setCustomProviderName] = useState(asset.customProviderName ?? "");
  const [accountIdentifier, setAccountIdentifier] = useState(asset.accountIdentifier ?? "");
  const [intendedOutcome, setIntendedOutcome] = useState<IntendedOutcome>(asset.intendedOutcome);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const response = await fetch(`/api/estates/${estateId}/assets/${asset.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customProviderName: asset.providerId ? undefined : customProviderName,
          accountIdentifier: accountIdentifier || null,
          intendedOutcome,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setSuccess(true);
      router.refresh();
    });
  }

  if (asset.archivedAt) {
    return <p className="text-sm text-gray-600">This asset is archived and can no longer be edited.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {!asset.providerId && (
        <label className="flex flex-col gap-1 text-sm">
          Provider / account name
          <input
            required
            value={customProviderName}
            onChange={(event) => setCustomProviderName(event.target.value)}
            className="rounded border border-gray-300 px-3 py-2"
          />
        </label>
      )}
      <label className="flex flex-col gap-1 text-sm">
        Account identifier (optional, non-secret)
        <input
          value={accountIdentifier}
          onChange={(event) => setAccountIdentifier(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Intended outcome
        <select
          value={intendedOutcome}
          onChange={(event) => setIntendedOutcome(event.target.value as IntendedOutcome)}
          className="rounded border border-gray-300 px-3 py-2"
        >
          {INTENDED_OUTCOMES.map((outcome) => (
            <option key={outcome} value={outcome}>
              {outcome}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-600">Saved.</p>}
      <button
        type="submit"
        disabled={isPending}
        className="w-fit rounded bg-black px-4 py-2 text-white disabled:opacity-50"
      >
        {isPending ? "Saving..." : "Save changes"}
      </button>
    </form>
  );
}
