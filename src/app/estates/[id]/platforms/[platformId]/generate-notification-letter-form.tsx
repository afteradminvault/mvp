"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { NotificationLetterType } from "@/domain/notification-letters/ports";

/** US-6.1/6.2 — kicks off auto-fill, then hands off to the letter editor. */
export function GenerateNotificationLetterForm({
  estateId,
  platformId,
  supportsMemorialize,
}: {
  estateId: string;
  platformId: string;
  supportsMemorialize: boolean;
}) {
  const router = useRouter();
  const [letterType, setLetterType] = useState<NotificationLetterType>("close");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleGenerate() {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/cases/${estateId}/notification-letters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platformId, letterType }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.push(`/estates/${estateId}/notification-letters/${result.letter.id}`);
    });
  }

  return (
    <div className="rounded border border-gray-300 p-4">
      <h2 className="mb-2 text-sm font-medium text-gray-700">Generate a notification letter</h2>

      {supportsMemorialize && (
        <div className="mb-3 flex gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="letterType"
              checked={letterType === "close"}
              onChange={() => setLetterType("close")}
            />
            Close the account
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="letterType"
              checked={letterType === "memorialize"}
              onChange={() => setLetterType("memorialize")}
            />
            Memorialize the account
          </label>
        </div>
      )}

      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

      <button
        onClick={handleGenerate}
        disabled={isPending}
        className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {isPending ? "Generating..." : "Generate letter"}
      </button>
    </div>
  );
}
