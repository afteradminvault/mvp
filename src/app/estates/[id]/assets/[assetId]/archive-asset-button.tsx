"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function ArchiveAssetButton({ estateId, assetId }: { estateId: string; assetId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!window.confirm("Archive this asset? It can't be edited afterward, and it's never deleted outright.")) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/estates/${estateId}/assets/${assetId}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={isPending}
        className="rounded border border-red-600 px-4 py-2 text-sm text-red-600 disabled:opacity-50"
      >
        {isPending ? "Archiving..." : "Archive asset"}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
