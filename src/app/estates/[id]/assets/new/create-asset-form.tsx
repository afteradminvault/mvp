"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { AssetCategory, IntendedOutcome } from "@/domain/assets/ports";

const CATEGORIES: AssetCategory[] = [
  "financial",
  "social",
  "subscription",
  "crypto",
  "cloud_storage",
  "domain",
  "other",
];

const INTENDED_OUTCOMES: IntendedOutcome[] = ["close", "transfer", "memorialize", "ignore", "other"];

export function CreateAssetForm({ estateId }: { estateId: string }) {
  const router = useRouter();
  const [category, setCategory] = useState<AssetCategory>("financial");
  const [customProviderName, setCustomProviderName] = useState("");
  const [accountIdentifier, setAccountIdentifier] = useState("");
  const [intendedOutcome, setIntendedOutcome] = useState<IntendedOutcome>("other");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/estates/${estateId}/assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          customProviderName,
          accountIdentifier: accountIdentifier || undefined,
          intendedOutcome,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.push(`/estates/${estateId}/assets/${result.asset.id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        Category
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value as AssetCategory)}
          className="rounded border border-gray-300 px-3 py-2"
        >
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Provider / account name
        <input
          required
          value={customProviderName}
          onChange={(event) => setCustomProviderName(event.target.value)}
          placeholder="e.g. Chase Checking, Facebook, GoDaddy"
          className="rounded border border-gray-300 px-3 py-2"
        />
        <span className="text-xs text-gray-500">
          A picker against known providers arrives once Milestone 2&apos;s provider directory is populated —
          free text for now.
        </span>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Account identifier (optional, non-secret — e.g. masked username or last 4 digits)
        <input
          value={accountIdentifier}
          onChange={(event) => setAccountIdentifier(event.target.value)}
          placeholder="e.g. ****1234 — never a password"
          className="rounded border border-gray-300 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Intended outcome
        <select
          value={intendedOutcome}
          onChange={(event) => setIntendedOutcome(event.target.value as IntendedOutcome)}
          className="rounded border border-gray-300 px-3 py-2"
        >
          {INTENDED_OUTCOMES.map((outcome) => (
            <option key={outcome} value={outcome}>
              {outcome}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={isPending}
        className="w-fit rounded bg-black px-4 py-2 text-white disabled:opacity-50"
      >
        {isPending ? "Adding..." : "Add asset"}
      </button>
    </form>
  );
}
