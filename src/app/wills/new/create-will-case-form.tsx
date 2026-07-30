"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Jurisdiction } from "@/domain/estates/ports";

export function CreateWillCaseForm({
  jurisdictions,
  defaultFullName,
}: {
  jurisdictions: Jurisdiction[];
  defaultFullName: string;
}) {
  const router = useRouter();
  const [deceasedFullName, setDeceasedFullName] = useState(defaultFullName);
  const [deceasedDateOfBirth, setDeceasedDateOfBirth] = useState("");
  const [jurisdictionId, setJurisdictionId] = useState(jurisdictions[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jurisdictionId,
          deceasedFullName,
          deceasedDateOfBirth,
          deceasedRelationship: "Self",
          isSelfPlanned: true,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.push(`/estates/${result.case.id}/will`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        Your full legal name
        <input
          required
          value={deceasedFullName}
          onChange={(event) => setDeceasedFullName(event.target.value)}
          placeholder="e.g. Marcus Whitfield"
          className="rounded border border-gray-300 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Date of birth
        <input
          type="date"
          required
          value={deceasedDateOfBirth}
          onChange={(event) => setDeceasedDateOfBirth(event.target.value)}
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
        <span className="text-xs text-gray-500">
          This determines your witness/notarization requirements — see docs/legal for what your state requires.
        </span>
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={isPending || jurisdictions.length === 0}
        className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
      >
        {isPending ? "Starting..." : "Start my Will"}
      </button>
      {jurisdictions.length === 0 && (
        <p className="text-sm text-red-600">
          No supported jurisdictions are configured yet — the jurisdiction seed migration hasn&apos;t been
          applied.
        </p>
      )}
    </form>
  );
}
