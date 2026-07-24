"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function SelfCancelBanner({
  estateId,
  selfCancelWindowDays,
  verificationStartedAt,
}: {
  estateId: string;
  selfCancelWindowDays: number;
  verificationStartedAt: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/estates/${estateId}/self-cancel`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="rounded border border-yellow-400 bg-yellow-50 p-4">
      <p className="text-sm text-yellow-900">
        A death report was filed for this estate. If you&apos;re seeing this, you&apos;re alive — confirm below to
        cancel it and resume normal check-ins.
        {verificationStartedAt &&
          ` You have ${selfCancelWindowDays} days from ${new Date(verificationStartedAt).toLocaleDateString()} to do this.`}
      </p>
      <button
        onClick={handleClick}
        disabled={isPending}
        className="mt-3 rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {isPending ? "Confirming..." : "I'm alive — cancel this report"}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
