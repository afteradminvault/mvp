"use client";

import { useState, useTransition, type FormEvent } from "react";
import type { AdminJurisdiction } from "@/domain/admin-jurisdictions/ports";
import type { LegalRequirement } from "@/domain/admin-legal-requirements/ports";
import {
  LegalRequirementFormFields,
  type LegalRequirementFormState,
} from "./legal-requirement-form-fields";

function emptyForm(): LegalRequirementFormState {
  return {
    jurisdictionId: "",
    assetCategory: "financial",
    requirementType: "death_certificate_certified",
    submissionChannel: "mail",
    submissionDetail: "",
    displayOrder: 0,
    notes: "",
    pendingCounselReview: false,
  };
}

function toFormState(requirement: LegalRequirement): LegalRequirementFormState {
  return {
    jurisdictionId: requirement.jurisdictionId,
    assetCategory: requirement.assetCategory,
    requirementType: requirement.requirementType,
    submissionChannel: requirement.submissionChannel,
    submissionDetail: requirement.submissionDetail ?? "",
    displayOrder: requirement.displayOrder,
    notes: requirement.notes ?? "",
    pendingCounselReview: requirement.pendingCounselReview,
  };
}

function toRequestBody(state: LegalRequirementFormState) {
  return {
    jurisdictionId: state.jurisdictionId,
    assetCategory: state.assetCategory,
    requirementType: state.requirementType,
    submissionChannel: state.submissionChannel,
    submissionDetail: state.submissionDetail || undefined,
    displayOrder: state.displayOrder,
    notes: state.notes || undefined,
    pendingCounselReview: state.pendingCounselReview,
  };
}

export function LegalRequirementsAdminClient({
  initialRequirements,
  jurisdictions,
}: {
  initialRequirements: LegalRequirement[];
  jurisdictions: AdminJurisdiction[];
}) {
  const [requirements, setRequirements] = useState(initialRequirements);
  const [createForm, setCreateForm] = useState<LegalRequirementFormState>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<LegalRequirementFormState>(emptyForm());
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function jurisdictionName(id: string): string {
    return jurisdictions.find((j) => j.id === id)?.displayName ?? id;
  }

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/admin/legal-requirements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toRequestBody(createForm)),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setRequirements((current) => [...current, result.requirement]);
      setCreateForm(emptyForm());
    });
  }

  function startEditing(requirement: LegalRequirement) {
    setEditingId(requirement.id);
    setEditForm(toFormState(requirement));
    setError(null);
  }

  function handleRevise(existingId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/admin/legal-requirements/${existingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toRequestBody(editForm)),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      // The old row is now superseded (no longer "current") — replace it
      // with the new version in this current-only list, never mutate it.
      setRequirements((current) => current.filter((r) => r.id !== existingId).concat(result.requirement));
      setEditingId(null);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <ul className="flex flex-col gap-3">
        {requirements.map((requirement) => (
          <li key={requirement.id} className="rounded border border-gray-300 p-3 text-sm">
            {editingId === requirement.id ? (
              <form onSubmit={(event) => handleRevise(requirement.id, event)} className="flex flex-col gap-3">
                <LegalRequirementFormFields state={editForm} onChange={setEditForm} jurisdictions={jurisdictions} />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={isPending}
                    className="rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50"
                  >
                    {isPending ? "Saving new version..." : "Save as new version"}
                  </button>
                  <button type="button" onClick={() => setEditingId(null)} className="text-sm underline">
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {jurisdictionName(requirement.jurisdictionId)} &middot; {requirement.assetCategory} &middot;{" "}
                    {requirement.requirementType}
                    {requirement.pendingCounselReview && (
                      <span className="ml-2 rounded bg-yellow-100 px-2 py-0.5 text-xs text-yellow-900">
                        🚩 pending counsel review
                      </span>
                    )}
                  </p>
                  <p className="text-gray-600">
                    {requirement.submissionChannel}
                    {requirement.submissionDetail ? ` — ${requirement.submissionDetail}` : ""}
                  </p>
                  {requirement.notes && <p className="mt-1 text-gray-600">{requirement.notes}</p>}
                </div>
                <button onClick={() => startEditing(requirement)} className="shrink-0 text-sm underline">
                  Revise
                </button>
              </div>
            )}
          </li>
        ))}
        {requirements.length === 0 && <p className="text-sm text-gray-600">No legal requirements yet.</p>}
      </ul>

      <form onSubmit={handleCreate} className="flex flex-col gap-3 border-t border-gray-200 pt-4">
        <h2 className="text-sm font-medium">Add a legal requirement</h2>
        <LegalRequirementFormFields state={createForm} onChange={setCreateForm} jurisdictions={jurisdictions} />
        <button
          type="submit"
          disabled={isPending || !createForm.jurisdictionId}
          className="w-fit rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {isPending ? "Adding..." : "Add requirement"}
        </button>
      </form>
    </div>
  );
}
