"use client";

import type { AdminJurisdiction } from "@/domain/admin-jurisdictions/ports";
import type { RequirementType, SubmissionChannel } from "@/domain/admin-legal-requirements/ports";
import type { AssetCategory } from "@/domain/assets/ports";

export const CATEGORIES: AssetCategory[] = [
  "financial",
  "social",
  "subscription",
  "crypto",
  "cloud_storage",
  "domain",
  "other",
];

export const REQUIREMENT_TYPES: RequirementType[] = [
  "death_certificate_certified",
  "death_certificate_copy",
  "letters_testamentary",
  "letters_of_administration",
  "small_estate_affidavit",
  "executor_government_id",
  "notarization",
  "court_order",
  "provider_specific_form",
];

export const SUBMISSION_CHANNELS: SubmissionChannel[] = ["online_form", "mail", "in_person", "api"];

export interface LegalRequirementFormState {
  jurisdictionId: string;
  assetCategory: AssetCategory;
  requirementType: RequirementType;
  submissionChannel: SubmissionChannel;
  submissionDetail: string;
  displayOrder: number;
  notes: string;
  pendingCounselReview: boolean;
}

export function LegalRequirementFormFields({
  state,
  onChange,
  jurisdictions,
}: {
  state: LegalRequirementFormState;
  onChange: (next: LegalRequirementFormState) => void;
  jurisdictions: AdminJurisdiction[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <select
        value={state.jurisdictionId}
        onChange={(event) => onChange({ ...state, jurisdictionId: event.target.value })}
        className="rounded border border-gray-300 px-2 py-1.5 text-sm"
      >
        <option value="">Select jurisdiction...</option>
        {jurisdictions.map((jurisdiction) => (
          <option key={jurisdiction.id} value={jurisdiction.id}>
            {jurisdiction.displayName}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <select
          value={state.assetCategory}
          onChange={(event) => onChange({ ...state, assetCategory: event.target.value as AssetCategory })}
          className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm"
        >
          {CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
        <select
          value={state.requirementType}
          onChange={(event) => onChange({ ...state, requirementType: event.target.value as RequirementType })}
          className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm"
        >
          {REQUIREMENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <select
          value={state.submissionChannel}
          onChange={(event) => onChange({ ...state, submissionChannel: event.target.value as SubmissionChannel })}
          className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm"
        >
          {SUBMISSION_CHANNELS.map((channel) => (
            <option key={channel} value={channel}>
              {channel}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={0}
          value={state.displayOrder}
          onChange={(event) => onChange({ ...state, displayOrder: Number(event.target.value) })}
          placeholder="Display order"
          className="w-32 rounded border border-gray-300 px-2 py-1.5 text-sm"
        />
      </div>
      <input
        value={state.submissionDetail}
        onChange={(event) => onChange({ ...state, submissionDetail: event.target.value })}
        placeholder="Submission detail — URL or mailing address"
        className="rounded border border-gray-300 px-2 py-1.5 text-sm"
      />
      <textarea
        value={state.notes}
        onChange={(event) => onChange({ ...state, notes: event.target.value })}
        placeholder="Notes"
        rows={2}
        className="rounded border border-gray-300 px-2 py-1.5 text-sm"
      />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={state.pendingCounselReview}
          onChange={(event) => onChange({ ...state, pendingCounselReview: event.target.checked })}
        />
        🚩 Pending counsel review
      </label>
    </div>
  );
}
