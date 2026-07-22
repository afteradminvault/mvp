import type { AssetCategory } from "@/domain/assets/ports";

/**
 * Admin legal-requirements domain contracts (Database Schema §3.2, API
 * Specification §8, Legal & Compliance §1.3). Framework-free, same
 * rationale as other ports.ts files.
 */

export type RequirementType =
  | "death_certificate_certified"
  | "death_certificate_copy"
  | "letters_testamentary"
  | "letters_of_administration"
  | "small_estate_affidavit"
  | "executor_government_id"
  | "notarization"
  | "court_order"
  | "provider_specific_form";

export type SubmissionChannel = "online_form" | "mail" | "in_person" | "api";

export interface LegalRequirement {
  id: string;
  jurisdictionId: string;
  assetCategory: AssetCategory;
  providerId: string | null;
  requirementType: RequirementType;
  submissionChannel: SubmissionChannel;
  submissionDetail: string | null;
  displayOrder: number;
  effectiveDate: string;
  supersededById: string | null;
  notes: string | null;
  pendingCounselReview: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LegalRequirementContentInput {
  jurisdictionId: string;
  assetCategory: AssetCategory;
  providerId?: string | null;
  requirementType: RequirementType;
  submissionChannel: SubmissionChannel;
  submissionDetail?: string | null;
  displayOrder?: number;
  notes?: string | null;
  pendingCounselReview?: boolean;
}

export interface ListLegalRequirementsFilter {
  jurisdictionId?: string;
  assetCategory?: AssetCategory;
  includeSuperseded?: boolean;
}

export interface LegalRequirementRepository {
  createRequirement(input: LegalRequirementContentInput): Promise<LegalRequirement>;
  listRequirements(filter?: ListLegalRequirementsFilter): Promise<LegalRequirement[]>;
  getRequirement(id: string): Promise<LegalRequirement | null>;
  /** Inserts a new row with `input`, then sets the existing row's superseded_by_id to it — never an in-place UPDATE of content columns. */
  reviseRequirement(existingId: string, input: LegalRequirementContentInput): Promise<LegalRequirement>;
}
