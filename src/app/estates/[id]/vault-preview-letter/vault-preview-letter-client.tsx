"use client";

import { useState, useTransition } from "react";
import type { VaultPreviewLetter } from "@/domain/vault-preview-letters/ports";
import { renderVaultPreviewLetter } from "@/infrastructure/vault-preview-letters/render-vault-preview-letter";

export function VaultPreviewLetterClient({
  caseId,
  caseDisplayName,
  initialLetters,
}: {
  caseId: string;
  caseDisplayName: string;
  initialLetters: VaultPreviewLetter[];
}) {
  const [letters, setLetters] = useState(initialLetters);
  const [selectedLetterId, setSelectedLetterId] = useState<string | null>(initialLetters[0]?.id ?? null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleGenerate() {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/cases/${caseId}/vault-preview-letter`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      const letter = result.letter as VaultPreviewLetter;
      setLetters((current) => [letter, ...current]);
      setSelectedLetterId(letter.id);
    });
  }

  const selectedLetter = letters.find((letter) => letter.id === selectedLetterId) ?? null;
  const rendered = selectedLetter
    ? renderVaultPreviewLetter({
        caseDisplayName,
        itemTypeSummary: selectedLetter.itemTypeSummary,
        generatedAt: selectedLetter.generatedAt,
      })
    : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <button
          onClick={handleGenerate}
          disabled={isPending}
          className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {isPending ? "Generating..." : "Generate new letter"}
        </button>
        {selectedLetter && (
          <button onClick={() => window.print()} className="rounded border border-gray-300 px-4 py-2 text-sm">
            Print
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600 print:hidden">{error}</p>}

      {letters.length > 0 && (
        <div className="print:hidden">
          <h2 className="mb-2 text-sm font-medium text-gray-700">Previously generated</h2>
          <ul className="flex flex-col gap-1">
            {letters.map((letter) => (
              <li key={letter.id}>
                <button
                  onClick={() => setSelectedLetterId(letter.id)}
                  className={`text-sm underline ${letter.id === selectedLetterId ? "font-medium" : "text-gray-600"}`}
                >
                  {new Date(letter.generatedAt).toLocaleString()}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {rendered && (
        <div className="rounded border border-gray-300 bg-white p-8 print:border-0 print:p-0">
          <div dangerouslySetInnerHTML={{ __html: rendered.html }} />
        </div>
      )}

      {!rendered && letters.length === 0 && (
        <p className="text-sm text-gray-600">No letters generated yet.</p>
      )}
    </div>
  );
}
