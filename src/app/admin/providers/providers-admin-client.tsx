"use client";

import { useState, useTransition, type FormEvent } from "react";
import type { AdminProvider, ClosureMethod } from "@/domain/admin-providers/ports";
import type { AssetCategory } from "@/domain/assets/ports";

const CATEGORIES: AssetCategory[] = [
  "financial",
  "social",
  "subscription",
  "crypto",
  "cloud_storage",
  "domain",
  "other",
];

const CLOSURE_METHODS: ClosureMethod[] = ["online_form", "email", "phone", "automatic"];

export function ProvidersAdminClient({ initialProviders }: { initialProviders: AdminProvider[] }) {
  const [providers, setProviders] = useState(initialProviders);
  const [name, setName] = useState("");
  const [defaultCategory, setDefaultCategory] = useState<AssetCategory>("financial");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [closureMethod, setClosureMethod] = useState<ClosureMethod | "">("");
  const [bereavementContactEmail, setBereavementContactEmail] = useState("");
  const [bereavementContactPhone, setBereavementContactPhone] = useState("");
  const [bereavementInstructionsUrl, setBereavementInstructionsUrl] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [isCommonOnboardingPlatform, setIsCommonOnboardingPlatform] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/admin/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          defaultCategory,
          websiteUrl: websiteUrl || undefined,
          notes: notes || undefined,
          closureMethod: closureMethod || undefined,
          bereavementContactEmail: bereavementContactEmail || undefined,
          bereavementContactPhone: bereavementContactPhone || undefined,
          bereavementInstructionsUrl: bereavementInstructionsUrl || undefined,
          logoUrl: logoUrl || undefined,
          isCommonOnboardingPlatform,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setProviders((current) => [...current, result.provider]);
      setName("");
      setWebsiteUrl("");
      setNotes("");
      setClosureMethod("");
      setBereavementContactEmail("");
      setBereavementContactPhone("");
      setBereavementInstructionsUrl("");
      setLogoUrl("");
      setIsCommonOnboardingPlatform(false);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <ul className="flex flex-col gap-2 text-sm">
        {providers.map((provider) => (
          <li key={provider.id} className="rounded border border-gray-300 p-3">
            <p className="font-medium">
              {provider.name} <span className="font-normal text-gray-600">&middot; {provider.defaultCategory}</span>
              {provider.isCommonOnboardingPlatform && (
                <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-normal text-gray-600">
                  onboarding checklist
                </span>
              )}
            </p>
            {provider.websiteUrl && <p className="text-gray-600">{provider.websiteUrl}</p>}
            {provider.notes && <p className="text-gray-600">{provider.notes}</p>}
            {provider.closureMethod && (
              <p className="text-gray-600">
                Closure via {provider.closureMethod.replace("_", " ")}
                {provider.bereavementContactEmail ? ` · ${provider.bereavementContactEmail}` : ""}
                {provider.bereavementContactPhone ? ` · ${provider.bereavementContactPhone}` : ""}
              </p>
            )}
          </li>
        ))}
        {providers.length === 0 && <p className="text-gray-600">No providers yet.</p>}
      </ul>

      <form onSubmit={handleCreate} className="flex flex-col gap-3 border-t border-gray-200 pt-4">
        <h2 className="text-sm font-medium">Add a provider</h2>
        <input
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Chase"
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <select
          value={defaultCategory}
          onChange={(event) => setDefaultCategory(event.target.value as AssetCategory)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        >
          {CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
        <input
          value={websiteUrl}
          onChange={(event) => setWebsiteUrl(event.target.value)}
          placeholder="https://chase.com (optional)"
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Internal notes (optional) — e.g. quirks in their closure process"
          rows={2}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        />

        <h3 className="text-sm font-medium text-gray-700">Closure catalog (PRD v2 §3.3)</h3>
        <select
          value={closureMethod}
          onChange={(event) => setClosureMethod(event.target.value as ClosureMethod | "")}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">No closure method set</option>
          {CLOSURE_METHODS.map((method) => (
            <option key={method} value={method}>
              {method.replace("_", " ")}
            </option>
          ))}
        </select>
        <input
          type="email"
          value={bereavementContactEmail}
          onChange={(event) => setBereavementContactEmail(event.target.value)}
          placeholder="Bereavement contact email (optional)"
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <input
          value={bereavementContactPhone}
          onChange={(event) => setBereavementContactPhone(event.target.value)}
          placeholder="Bereavement contact phone (optional)"
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <input
          value={bereavementInstructionsUrl}
          onChange={(event) => setBereavementInstructionsUrl(event.target.value)}
          placeholder="https://... bereavement instructions URL (optional)"
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <input
          value={logoUrl}
          onChange={(event) => setLogoUrl(event.target.value)}
          placeholder="https://... logo URL (optional)"
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={isCommonOnboardingPlatform}
            onChange={(event) => setIsCommonOnboardingPlatform(event.target.checked)}
          />
          Show in the onboarding checklist (US-2.4)
        </label>

        <button
          type="submit"
          disabled={isPending}
          className="w-fit rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {isPending ? "Adding..." : "Add provider"}
        </button>
      </form>
    </div>
  );
}
