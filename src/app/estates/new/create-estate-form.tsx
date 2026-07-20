"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Jurisdiction } from "@/domain/estates/ports";

export function CreateEstateForm({ jurisdictions }: { jurisdictions: Jurisdiction[] }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [jurisdictionId, setJurisdictionId] = useState(jurisdictions[0]?.id ?? "");
  const [checkInIntervalDays, setCheckInIntervalDays] = useState(90);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/estates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, jurisdictionId, checkInIntervalDays }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.push(`/estates/${result.estate.id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        Estate name
        <input
          required
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder="e.g. Diane's Estate"
          className="rounded border border-gray-300 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Jurisdiction
        <select
          required
          value={jurisdictionId}
          onChange={(event) => setJurisdictionId(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
        >
          {jurisdictions.map((jurisdiction) => (
            <option key={jurisdiction.id} value={jurisdiction.id}>
              {jurisdiction.displayName}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Check-in interval (days)
        <input
          type="number"
          required
          min={30}
          max={365}
          value={checkInIntervalDays}
          onChange={(event) => setCheckInIntervalDays(Number(event.target.value))}
          className="rounded border border-gray-300 px-3 py-2"
        />
        <span className="text-xs text-gray-500">
          How often you&apos;ll be asked to confirm you&apos;re still active. 30–365 days.
        </span>
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={isPending || jurisdictions.length === 0}
        className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
      >
        {isPending ? "Creating..." : "Create estate"}
      </button>
      {jurisdictions.length === 0 && (
        <p className="text-sm text-red-600">
          No supported jurisdictions are configured yet — the jurisdiction seed migration hasn&apos;t
          been applied.
        </p>
      )}
    </form>
  );
}
