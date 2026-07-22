"use client";

import { useState, useTransition, type FormEvent } from "react";
import type { AdminJurisdiction } from "@/domain/admin-jurisdictions/ports";

export function JurisdictionsAdminClient({ initialJurisdictions }: { initialJurisdictions: AdminJurisdiction[] }) {
  const [jurisdictions, setJurisdictions] = useState(initialJurisdictions);
  const [countryCode, setCountryCode] = useState("US");
  const [regionCode, setRegionCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/admin/jurisdictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ countryCode, regionCode: regionCode || null, displayName }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setJurisdictions((current) => [...current, result.jurisdiction]);
      setDisplayName("");
      setRegionCode("");
    });
  }

  function handleToggleSupported(jurisdiction: AdminJurisdiction) {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/admin/jurisdictions/${jurisdiction.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isSupported: !jurisdiction.isSupported }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setJurisdictions((current) => current.map((j) => (j.id === jurisdiction.id ? result.jurisdiction : j)));
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-300">
            <th className="py-1">Country</th>
            <th className="py-1">Region</th>
            <th className="py-1">Display name</th>
            <th className="py-1">Supported</th>
          </tr>
        </thead>
        <tbody>
          {jurisdictions.map((jurisdiction) => (
            <tr key={jurisdiction.id} className="border-b border-gray-100">
              <td className="py-1">{jurisdiction.countryCode}</td>
              <td className="py-1">{jurisdiction.regionCode ?? "(country-level)"}</td>
              <td className="py-1">{jurisdiction.displayName}</td>
              <td className="py-1">
                <button
                  onClick={() => handleToggleSupported(jurisdiction)}
                  disabled={isPending}
                  className="underline disabled:opacity-50"
                >
                  {jurisdiction.isSupported ? "Yes — hide" : "No — show"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <form onSubmit={handleCreate} className="flex flex-col gap-3 border-t border-gray-200 pt-4">
        <h2 className="text-sm font-medium">Add a jurisdiction</h2>
        <div className="flex gap-3">
          <input
            required
            value={countryCode}
            onChange={(event) => setCountryCode(event.target.value.toUpperCase())}
            maxLength={2}
            placeholder="US"
            className="w-16 rounded border border-gray-300 px-2 py-1.5 text-sm"
          />
          <input
            value={regionCode}
            onChange={(event) => setRegionCode(event.target.value.toUpperCase())}
            placeholder="CA (blank = country-level)"
            className="rounded border border-gray-300 px-2 py-1.5 text-sm"
          />
        </div>
        <input
          required
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder="California, United States"
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={isPending}
          className="w-fit rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {isPending ? "Adding..." : "Add jurisdiction"}
        </button>
      </form>
    </div>
  );
}
