"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Estate } from "@/domain/estates/ports";

export function EditEstateForm({ estate }: { estate: Estate }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(estate.displayName);
  const [checkInIntervalDays, setCheckInIntervalDays] = useState(estate.checkInIntervalDays);
  const [gracePeriodDays, setGracePeriodDays] = useState(estate.gracePeriodDays);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const response = await fetch(`/api/estates/${estate.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, checkInIntervalDays, gracePeriodDays }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setSuccess(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        Estate name
        <input
          required
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Check-in interval (days)
        <input
          type="number"
          required
          min={30}
          max={365}
          value={checkInIntervalDays}
          onChange={(event) => setCheckInIntervalDays(Number(event.target.value))}
          className="rounded border border-gray-300 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Grace period (days)
        <input
          type="number"
          required
          min={7}
          max={90}
          value={gracePeriodDays}
          onChange={(event) => setGracePeriodDays(Number(event.target.value))}
          className="rounded border border-gray-300 px-3 py-2"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-600">Saved.</p>}
      <button
        type="submit"
        disabled={isPending}
        className="w-fit rounded bg-black px-4 py-2 text-white disabled:opacity-50"
      >
        {isPending ? "Saving..." : "Save changes"}
      </button>
    </form>
  );
}
