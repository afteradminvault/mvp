"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Platform } from "@/domain/platforms/ports";

export function ChecklistForm({
  caseId,
  platforms,
  initialCheckedPlatformIds,
}: {
  caseId: string;
  platforms: Platform[];
  initialCheckedPlatformIds: string[];
}) {
  const router = useRouter();
  const [checkedIds, setCheckedIds] = useState(new Set(initialCheckedPlatformIds));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle(platformId: string) {
    setCheckedIds((current) => {
      const next = new Set(current);
      if (next.has(platformId)) {
        next.delete(platformId);
      } else {
        next.add(platformId);
      }
      return next;
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      // Only newly-checked platforms get a new digital_asset — revisiting
      // this step and re-submitting must not create duplicates for
      // platforms already added on a previous pass.
      const newlyChecked = platforms.filter(
        (platform) => checkedIds.has(platform.id) && !initialCheckedPlatformIds.includes(platform.id),
      );

      for (const platform of newlyChecked) {
        const response = await fetch(`/api/estates/${caseId}/assets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category: platform.defaultCategory, providerId: platform.id }),
        });
        if (!response.ok) {
          const result = await response.json().catch(() => ({}));
          setError(result.error ?? `Couldn't add ${platform.name}.`);
          return;
        }
      }

      const draftResponse = await fetch(`/api/cases/${caseId}/draft`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftStep: "certificate",
          draftPayload: { checklist: Array.from(checkedIds) },
        }),
      });
      if (!draftResponse.ok) {
        const result = await draftResponse.json().catch(() => ({}));
        setError(result.error ?? "Something went wrong.");
        return;
      }

      router.push(`/cases/${caseId}/onboarding/certificate`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {platforms.length === 0 ? (
        <p className="text-sm text-gray-600">
          No common platforms are configured yet — you can add accounts individually once your Case is set
          up.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {platforms.map((platform) => (
            <li key={platform.id}>
              <label className="flex items-center gap-3 rounded border border-gray-300 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={checkedIds.has(platform.id)}
                  onChange={() => toggle(platform.id)}
                />
                {platform.name}
                <span className="ml-auto text-xs text-gray-500">{platform.defaultCategory}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
      >
        {isPending ? "Saving..." : "Continue"}
      </button>
    </form>
  );
}
