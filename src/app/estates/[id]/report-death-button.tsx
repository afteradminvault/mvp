"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function ReportDeathButton({ estateId }: { estateId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/estates/${estateId}/report-death`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setConfirming(false);
      router.refresh();
    });
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="rounded border border-red-600 px-4 py-2 text-sm text-red-600"
      >
        Report a death
      </button>
    );
  }

  return (
    <div className="rounded border border-red-300 bg-red-50 p-4">
      <p className="text-sm text-red-900">
        This notifies the estate owner immediately and starts a self-cancel window for them to confirm they&apos;re
        alive. Only do this if you genuinely believe the Planner has passed away.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          onClick={handleConfirm}
          disabled={isPending}
          className="rounded bg-red-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {isPending ? "Reporting..." : "Yes, report this death"}
        </button>
        <button type="button" onClick={() => setConfirming(false)} className="text-sm underline">
          Cancel
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
