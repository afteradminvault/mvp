"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { WillExecutionRequirement } from "@/domain/admin-will-execution-requirements/ports";
import type { BequestCategory, Will, WillBequest } from "@/domain/wills/ports";

const BEQUEST_CATEGORIES: { value: BequestCategory; label: string }[] = [
  { value: "real_property", label: "Real property" },
  { value: "financial_account", label: "Financial account" },
  { value: "business_interest", label: "Business interest" },
  { value: "personal_property", label: "Personal property" },
  { value: "digital_asset", label: "Digital asset" },
  { value: "vehicle", label: "Vehicle" },
  { value: "other", label: "Other" },
];

const STATUS_LABELS: Record<Will["status"], string> = {
  draft: "Draft — not yet generated",
  ready_to_sign: "Ready to sign — not yet a valid will",
  executed: "Executed — signed per your jurisdiction's requirements",
  superseded: "Superseded by a newer version",
  revoked: "Revoked",
};

interface Option {
  id: string;
  label: string;
}

export function WillWizardClient({
  estateId,
  will: initialWill,
  initialBequests,
  executionRequirement,
  assets,
  beneficiaries,
}: {
  estateId: string;
  will: Will;
  initialBequests: WillBequest[];
  executionRequirement: WillExecutionRequirement | null;
  assets: Option[];
  beneficiaries: Option[];
}) {
  const [will, setWill] = useState(initialWill);
  const [bequests, setBequests] = useState(initialBequests);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [hasMinorChildren, setHasMinorChildren] = useState(will.hasMinorChildren);
  const [guardianFullName, setGuardianFullName] = useState(will.guardianFullName ?? "");
  const [guardianRelationship, setGuardianRelationship] = useState(will.guardianRelationship ?? "");
  const [alternateGuardianFullName, setAlternateGuardianFullName] = useState(will.alternateGuardianFullName ?? "");
  const [alternateGuardianRelationship, setAlternateGuardianRelationship] = useState(
    will.alternateGuardianRelationship ?? "",
  );

  const [residuary, setResiduary] = useState(will.residuaryBeneficiaryDescription ?? "");

  const [bequestCategory, setBequestCategory] = useState<BequestCategory>("personal_property");
  const [bequestLinkType, setBequestLinkType] = useState<"none" | "asset" | "beneficiary">("none");
  const [bequestLinkId, setBequestLinkId] = useState("");
  const [bequestDescription, setBequestDescription] = useState("");

  const isEditable = will.status !== "revoked";

  function handleSaveGuardian() {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/cases/${estateId}/will/guardian`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hasMinorChildren,
          guardianFullName: guardianFullName || null,
          guardianRelationship: guardianRelationship || null,
          alternateGuardianFullName: alternateGuardianFullName || null,
          alternateGuardianRelationship: alternateGuardianRelationship || null,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setWill(result.will);
      setNotice("Guardian info saved.");
    });
  }

  function handleSaveResiduary() {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/cases/${estateId}/will/residuary`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: residuary || null }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setWill(result.will);
      setNotice("Residuary clause saved.");
    });
  }

  function handleAddBequest() {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/cases/${estateId}/will/bequests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bequestCategory,
          digitalAssetId: bequestLinkType === "asset" ? bequestLinkId : undefined,
          beneficiaryId: bequestLinkType === "beneficiary" ? bequestLinkId : undefined,
          description: bequestDescription || undefined,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setBequests((current) => [...current, result.bequest]);
      setBequestDescription("");
      setBequestLinkId("");
      setBequestLinkType("none");
    });
  }

  function handleRemoveBequest(bequestId: string) {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/cases/${estateId}/will/bequests/${bequestId}`, { method: "DELETE" });
      if (!response.ok) {
        const result = await response.json();
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setBequests((current) => current.filter((b) => b.id !== bequestId));
    });
  }

  function handleGenerate() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const response = await fetch(`/api/cases/${estateId}/will/generate`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setWill(result.will);
      setNotice("A new version was generated. Find it in your Case's documents.");
    });
  }

  function handleExecute() {
    if (
      !window.confirm(
        "Only confirm this after you have actually printed, signed, and witnessed this Will per your jurisdiction's requirements. Confirming without doing so does not make it valid.",
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/cases/${estateId}/will/execute`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setWill(result.will);
    });
  }

  function handleRevoke() {
    if (!window.confirm("Revoke this Will? This cannot be undone.")) return;
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/cases/${estateId}/will/revoke`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setWill(result.will);
    });
  }

  return (
    <div className="flex flex-col gap-8">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="text-sm text-green-700">{notice}</p>}

      <div className="rounded border border-gray-300 p-4">
        <p className="text-sm font-medium">Status: {STATUS_LABELS[will.status]}</p>
        {will.status !== "executed" && (
          <p className="mt-1 text-xs text-gray-600">
            This is not a valid, legally binding will until it has been printed, signed, and witnessed exactly as
            described below.
          </p>
        )}
      </div>

      <div className="rounded border border-yellow-400 bg-yellow-50 p-4">
        <h2 className="mb-1 text-sm font-medium text-yellow-900">Execution requirements for your jurisdiction</h2>
        {executionRequirement ? (
          <>
            <p className="text-sm text-yellow-900">{executionRequirement.executionInstructions}</p>
            <p className="mt-1 text-xs text-yellow-800">
              Witnesses required: {executionRequirement.witnessCount}
              {executionRequirement.notarizationRequired ? " · Notarization required" : ""}
            </p>
          </>
        ) : (
          <p className="text-sm text-yellow-900">
            No execution requirements are on file for your jurisdiction yet — you won&apos;t be able to generate a
            final document until AfterVault has them configured. Contact support.
          </p>
        )}
      </div>

      <section>
        <h2 className="mb-2 text-lg font-medium">Guardian for minor children</h2>
        <label className="mb-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={hasMinorChildren}
            disabled={!isEditable}
            onChange={(event) => setHasMinorChildren(event.target.checked)}
          />
          I have minor children
        </label>
        {hasMinorChildren && (
          <div className="flex flex-col gap-2">
            <input
              value={guardianFullName}
              onChange={(event) => setGuardianFullName(event.target.value)}
              placeholder="Guardian's full name"
              disabled={!isEditable}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              value={guardianRelationship}
              onChange={(event) => setGuardianRelationship(event.target.value)}
              placeholder="Relationship (e.g. sister)"
              disabled={!isEditable}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              value={alternateGuardianFullName}
              onChange={(event) => setAlternateGuardianFullName(event.target.value)}
              placeholder="Alternate guardian's full name (optional)"
              disabled={!isEditable}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              value={alternateGuardianRelationship}
              onChange={(event) => setAlternateGuardianRelationship(event.target.value)}
              placeholder="Alternate's relationship (optional)"
              disabled={!isEditable}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        )}
        <button
          onClick={handleSaveGuardian}
          disabled={isPending || !isEditable}
          className="mt-2 rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          Save
        </button>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-medium">Specific bequests</h2>
        <ul className="mb-4 flex flex-col gap-2">
          {bequests.map((bequest) => (
            <li key={bequest.id} className="flex items-center justify-between rounded border border-gray-300 p-3 text-sm">
              <div>
                <p className="font-medium">{BEQUEST_CATEGORIES.find((c) => c.value === bequest.bequestCategory)?.label}</p>
                <p className="text-gray-600">
                  {bequest.digitalAssetId
                    ? (assets.find((a) => a.id === bequest.digitalAssetId)?.label ?? "linked account")
                    : bequest.beneficiaryId
                      ? `to ${beneficiaries.find((b) => b.id === bequest.beneficiaryId)?.label ?? "linked beneficiary"}`
                      : bequest.description}
                </p>
              </div>
              {isEditable && (
                <button onClick={() => handleRemoveBequest(bequest.id)} disabled={isPending} className="text-sm text-red-600 underline disabled:opacity-50">
                  Remove
                </button>
              )}
            </li>
          ))}
          {bequests.length === 0 && <p className="text-sm text-gray-600">No specific bequests yet — everything will pass under your residuary clause.</p>}
        </ul>

        {isEditable && (
          <div className="flex flex-col gap-2 border-t border-gray-200 pt-4">
            <select
              value={bequestCategory}
              onChange={(event) => setBequestCategory(event.target.value as BequestCategory)}
              className="rounded border border-gray-300 px-2 py-1.5 text-sm"
            >
              {BEQUEST_CATEGORIES.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </select>
            <select
              value={bequestLinkType}
              onChange={(event) => {
                setBequestLinkType(event.target.value as "none" | "asset" | "beneficiary");
                setBequestLinkId("");
              }}
              className="rounded border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="none">Describe it in free text</option>
              <option value="asset">Link an existing digital asset from this Case</option>
              <option value="beneficiary">Link an existing beneficiary from this Case</option>
            </select>
            {bequestLinkType === "asset" && (
              <select value={bequestLinkId} onChange={(event) => setBequestLinkId(event.target.value)} className="rounded border border-gray-300 px-2 py-1.5 text-sm">
                <option value="">Choose an asset...</option>
                {assets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.label}
                  </option>
                ))}
              </select>
            )}
            {bequestLinkType === "beneficiary" && (
              <select value={bequestLinkId} onChange={(event) => setBequestLinkId(event.target.value)} className="rounded border border-gray-300 px-2 py-1.5 text-sm">
                <option value="">Choose a beneficiary...</option>
                {beneficiaries.map((beneficiary) => (
                  <option key={beneficiary.id} value={beneficiary.id}>
                    {beneficiary.label}
                  </option>
                ))}
              </select>
            )}
            <input
              value={bequestDescription}
              onChange={(event) => setBequestDescription(event.target.value)}
              placeholder={bequestLinkType === "none" ? "e.g. My house at 123 Main St, to my sister Jane" : "Additional notes (optional)"}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <button
              onClick={handleAddBequest}
              disabled={isPending || (bequestLinkType !== "none" && !bequestLinkId) || (bequestLinkType === "none" && !bequestDescription)}
              className="w-fit rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              Add bequest
            </button>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-medium">Residuary estate</h2>
        <p className="mb-2 text-xs text-gray-600">
          Everything not specifically bequeathed above. Note: accounts with their own beneficiary designation
          (life insurance, retirement accounts) pass outside this Will regardless of what you write here.
        </p>
        <textarea
          value={residuary}
          onChange={(event) => setResiduary(event.target.value)}
          disabled={!isEditable}
          rows={3}
          placeholder="e.g. Everything else to my spouse, Jane Doe."
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          onClick={handleSaveResiduary}
          disabled={isPending || !isEditable}
          className="mt-2 rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          Save
        </button>
      </section>

      <section className="border-t border-gray-200 pt-6">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleGenerate}
            disabled={isPending || will.status === "revoked" || !executionRequirement}
            className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {will.status === "draft" ? "Generate my Will" : "Regenerate"}
          </button>
          {will.status === "ready_to_sign" && (
            <button onClick={handleExecute} disabled={isPending} className="rounded border border-gray-300 px-4 py-2 text-sm disabled:opacity-50">
              I&apos;ve signed it — mark as executed
            </button>
          )}
          {will.status !== "revoked" && (
            <button onClick={handleRevoke} disabled={isPending} className="rounded border border-red-300 px-4 py-2 text-sm text-red-600 disabled:opacity-50">
              Revoke
            </button>
          )}
        </div>
        {will.currentVersionId && (
          <p className="mt-3 text-sm">
            <Link href={`/estates/${estateId}/documents`} className="underline">
              View the generated document in your Case&apos;s documents &rarr;
            </Link>
          </p>
        )}
      </section>
    </div>
  );
}
