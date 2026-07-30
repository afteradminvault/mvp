"use client";

import { useState, useTransition } from "react";
import type { AdminCaseSummary } from "@/domain/admin-cases/ports";

export function AdminCasesClient({ initialCases }: { initialCases: AdminCaseSummary[] }) {
  const [cases, setCases] = useState(initialCases);
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleToggleFlag(adminCase: AdminCaseSummary) {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/admin/cases/${adminCase.id}/flag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flagged: !adminCase.flagged,
          flaggedNotes: !adminCase.flagged ? (notesDraft[adminCase.id] ?? "") : undefined,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setCases((current) => current.map((c) => (c.id === adminCase.id ? result.case : c)));
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <ul className="flex flex-col gap-2">
        {cases.map((adminCase) => (
          <li key={adminCase.id} className="rounded border border-gray-300 p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">
                  {adminCase.displayName} <span className="font-normal text-gray-600">&middot; {adminCase.status}</span>
                  {adminCase.flagged && (
                    <span className="ml-2 rounded bg-yellow-100 px-1.5 py-0.5 text-xs text-yellow-900">flagged</span>
                  )}
                </p>
                {adminCase.flaggedNotes && <p className="mt-1 text-gray-600">{adminCase.flaggedNotes}</p>}
              </div>
              <button onClick={() => handleToggleFlag(adminCase)} disabled={isPending} className="shrink-0 underline disabled:opacity-50">
                {adminCase.flagged ? "Clear flag" : "Flag"}
              </button>
            </div>
            {!adminCase.flagged && (
              <input
                value={notesDraft[adminCase.id] ?? ""}
                onChange={(event) => setNotesDraft((current) => ({ ...current, [adminCase.id]: event.target.value }))}
                placeholder="Notes for the flag (optional)"
                className="mt-2 w-full rounded border border-gray-300 px-2 py-1 text-xs"
              />
            )}
          </li>
        ))}
        {cases.length === 0 && <p className="text-sm text-gray-600">No cases match this filter.</p>}
      </ul>
    </div>
  );
}
