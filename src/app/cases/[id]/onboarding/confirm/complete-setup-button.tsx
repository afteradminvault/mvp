"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function CompleteSetupButton({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleComplete() {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/cases/${caseId}/activate`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.push(`/cases/${caseId}/onboarding/summary`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        onClick={handleComplete}
        disabled={isPending}
        className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
      >
        {isPending ? "Finishing..." : "Complete setup"}
      </button>
    </div>
  );
}
