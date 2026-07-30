"use client";

import { useState, useTransition, type FormEvent } from "react";
import type { AdminJurisdiction } from "@/domain/admin-jurisdictions/ports";
import type { WillExecutionRequirement } from "@/domain/admin-will-execution-requirements/ports";

export function WillExecutionRequirementsAdminClient({
  initialRequirements,
  jurisdictions,
}: {
  initialRequirements: WillExecutionRequirement[];
  jurisdictions: AdminJurisdiction[];
}) {
  const [requirements, setRequirements] = useState(initialRequirements);
  const [jurisdictionId, setJurisdictionId] = useState(jurisdictions[0]?.id ?? "");
  const [witnessCount, setWitnessCount] = useState(2);
  const [notarizationRequired, setNotarizationRequired] = useState(false);
  const [selfProvingAffidavitAvailable, setSelfProvingAffidavitAvailable] = useState(false);
  const [holographicWillsAllowed, setHolographicWillsAllowed] = useState(false);
  const [executionInstructions, setExecutionInstructions] = useState("");
  const [notes, setNotes] = useState("");
  const [pendingCounselReview, setPendingCounselReview] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function jurisdictionName(id: string): string {
    return jurisdictions.find((j) => j.id === id)?.displayName ?? id;
  }

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/admin/will-execution-requirements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jurisdictionId,
          witnessCount,
          notarizationRequired,
          selfProvingAffidavitAvailable,
          holographicWillsAllowed,
          executionInstructions,
          notes: notes || undefined,
          pendingCounselReview,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setRequirements((current) => [...current, result.requirement]);
      setExecutionInstructions("");
      setNotes("");
    });
  }

  function handleRevise(requirement: WillExecutionRequirement) {
    setError(null);
    const updatedInstructions = window.prompt("Updated execution instructions:", requirement.executionInstructions);
    if (updatedInstructions === null) return;
    startTransition(async () => {
      const response = await fetch(`/api/admin/will-execution-requirements/${requirement.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jurisdictionId: requirement.jurisdictionId,
          witnessCount: requirement.witnessCount,
          notarizationRequired: requirement.notarizationRequired,
          selfProvingAffidavitAvailable: requirement.selfProvingAffidavitAvailable,
          holographicWillsAllowed: requirement.holographicWillsAllowed,
          executionInstructions: updatedInstructions,
          notes: requirement.notes ?? undefined,
          pendingCounselReview: requirement.pendingCounselReview,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setRequirements((current) => [...current.filter((r) => r.id !== requirement.id), result.requirement]);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <ul className="flex flex-col gap-2 text-sm">
        {requirements.map((requirement) => (
          <li key={requirement.id} className="rounded border border-gray-300 p-3">
            <p className="font-medium">
              {jurisdictionName(requirement.jurisdictionId)}
              {requirement.pendingCounselReview && (
                <span className="ml-2 rounded bg-yellow-100 px-1.5 py-0.5 text-xs font-normal text-yellow-900">
                  🚩 pending counsel review
                </span>
              )}
            </p>
            <p className="text-gray-600">{requirement.executionInstructions}</p>
            <p className="text-xs text-gray-500">
              {requirement.witnessCount} witnesses
              {requirement.notarizationRequired ? " · notarization required" : ""}
              {requirement.selfProvingAffidavitAvailable ? " · self-proving affidavit available" : ""}
              {requirement.holographicWillsAllowed ? " · holographic wills allowed" : ""}
            </p>
            <button onClick={() => handleRevise(requirement)} disabled={isPending} className="mt-2 text-xs underline disabled:opacity-50">
              Revise
            </button>
          </li>
        ))}
        {requirements.length === 0 && <p className="text-gray-600">No requirements configured yet.</p>}
      </ul>

      <form onSubmit={handleCreate} className="flex flex-col gap-3 border-t border-gray-200 pt-4">
        <h2 className="text-sm font-medium">Add a requirement</h2>
        <select
          value={jurisdictionId}
          onChange={(event) => setJurisdictionId(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        >
          {jurisdictions.map((jurisdiction) => (
            <option key={jurisdiction.id} value={jurisdiction.id}>
              {jurisdiction.displayName}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          Witnesses required
          <input
            type="number"
            min={0}
            value={witnessCount}
            onChange={(event) => setWitnessCount(Number(event.target.value))}
            className="w-20 rounded border border-gray-300 px-2 py-1"
          />
        </label>
        <textarea
          required
          value={executionInstructions}
          onChange={(event) => setExecutionInstructions(event.target.value)}
          placeholder="Execution instructions shown to testators (e.g. 'Print, sign in front of two witnesses, store the original.')"
          rows={3}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={notarizationRequired} onChange={(event) => setNotarizationRequired(event.target.checked)} />
          Notarization required
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={selfProvingAffidavitAvailable}
            onChange={(event) => setSelfProvingAffidavitAvailable(event.target.checked)}
          />
          Self-proving affidavit available
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={holographicWillsAllowed} onChange={(event) => setHolographicWillsAllowed(event.target.checked)} />
          Holographic (handwritten) wills allowed
        </label>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Internal notes (optional)"
          rows={2}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={pendingCounselReview} onChange={(event) => setPendingCounselReview(event.target.checked)} />
          Pending counsel review (defaults on — only clear this once real legal review has happened)
        </label>

        <button type="submit" disabled={isPending || !jurisdictionId} className="w-fit rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50">
          {isPending ? "Adding..." : "Add requirement"}
        </button>
      </form>
    </div>
  );
}
