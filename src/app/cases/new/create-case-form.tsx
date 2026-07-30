"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Jurisdiction } from "@/domain/estates/ports";

export function CreateCaseForm({ jurisdictions }: { jurisdictions: Jurisdiction[] }) {
  const router = useRouter();
  const [deceasedFullName, setDeceasedFullName] = useState("");
  const [deceasedDateOfBirth, setDeceasedDateOfBirth] = useState("");
  const [deceasedRelationship, setDeceasedRelationship] = useState("");
  const [deceasedDateOfDeath, setDeceasedDateOfDeath] = useState("");
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
          deceasedRelationship,
          deceasedDateOfDeath: deceasedDateOfDeath || undefined,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      // "profile" (this step) is complete the moment the case exists —
      // draft_step stays null until the next step's own PATCH, so the
      // next stop is "checklist" (see resolveCurrentStepKey in
      // ../[id]/onboarding/steps.ts).
      router.push(`/cases/${result.case.id}/onboarding/checklist`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        Their full name
        <input
          required
          value={deceasedFullName}
          onChange={(event) => setDeceasedFullName(event.target.value)}
          placeholder="e.g. Diane Whitfield"
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
        Your relationship to them
        <input
          required
          value={deceasedRelationship}
          onChange={(event) => setDeceasedRelationship(event.target.value)}
          placeholder="e.g. daughter, spouse, executor"
          className="rounded border border-gray-300 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Date of death <span className="font-normal text-gray-500">(optional)</span>
        <input
          type="date"
          value={deceasedDateOfDeath}
          onChange={(event) => setDeceasedDateOfDeath(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
        />
        <span className="text-xs text-gray-500">
          Leave this blank if you&apos;re setting things up in advance — that&apos;s just as welcome here
          as picking up after a loss.
        </span>
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
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={isPending || jurisdictions.length === 0}
        className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
      >
        {isPending ? "Starting..." : "Start this Case"}
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
