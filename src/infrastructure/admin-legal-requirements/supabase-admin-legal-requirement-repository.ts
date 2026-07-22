import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssetCategory } from "@/domain/assets/ports";
import type {
  LegalRequirement,
  LegalRequirementContentInput,
  LegalRequirementRepository,
  ListLegalRequirementsFilter,
  RequirementType,
  SubmissionChannel,
} from "@/domain/admin-legal-requirements/ports";

interface LegalRequirementRow {
  id: string;
  jurisdiction_id: string;
  asset_category: AssetCategory;
  provider_id: string | null;
  requirement_type: RequirementType;
  submission_channel: SubmissionChannel;
  submission_detail: string | null;
  display_order: number;
  effective_date: string;
  superseded_by_id: string | null;
  notes: string | null;
  pending_counsel_review: boolean;
  created_at: string;
  updated_at: string;
}

function toLegalRequirement(row: LegalRequirementRow): LegalRequirement {
  return {
    id: row.id,
    jurisdictionId: row.jurisdiction_id,
    assetCategory: row.asset_category,
    providerId: row.provider_id,
    requirementType: row.requirement_type,
    submissionChannel: row.submission_channel,
    submissionDetail: row.submission_detail,
    displayOrder: row.display_order,
    effectiveDate: row.effective_date,
    supersededById: row.superseded_by_id,
    notes: row.notes,
    pendingCounselReview: row.pending_counsel_review,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SupabaseAdminLegalRequirementRepository implements LegalRequirementRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async createRequirement(input: LegalRequirementContentInput): Promise<LegalRequirement> {
    const { data, error } = await this.supabase
      .from("legal_requirements")
      .insert({
        jurisdiction_id: input.jurisdictionId,
        asset_category: input.assetCategory,
        provider_id: input.providerId ?? null,
        requirement_type: input.requirementType,
        submission_channel: input.submissionChannel,
        submission_detail: input.submissionDetail ?? null,
        display_order: input.displayOrder ?? 0,
        notes: input.notes ?? null,
        pending_counsel_review: input.pendingCounselReview ?? false,
      })
      .select("*")
      .single();
    if (error) throw error;
    return toLegalRequirement(data as LegalRequirementRow);
  }

  async listRequirements(filter?: ListLegalRequirementsFilter): Promise<LegalRequirement[]> {
    let query = this.supabase.from("legal_requirements").select("*");
    if (filter?.jurisdictionId !== undefined) {
      query = query.eq("jurisdiction_id", filter.jurisdictionId);
    }
    if (filter?.assetCategory !== undefined) {
      query = query.eq("asset_category", filter.assetCategory);
    }
    if (!filter?.includeSuperseded) {
      query = query.is("superseded_by_id", null);
    }
    const { data, error } = await query
      .order("jurisdiction_id", { ascending: true })
      .order("display_order", { ascending: true });
    if (error) throw error;
    return (data as LegalRequirementRow[]).map(toLegalRequirement);
  }

  async getRequirement(id: string): Promise<LegalRequirement | null> {
    const { data, error } = await this.supabase
      .from("legal_requirements")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? toLegalRequirement(data as LegalRequirementRow) : null;
  }

  async reviseRequirement(existingId: string, input: LegalRequirementContentInput): Promise<LegalRequirement> {
    const { data, error } = await this.supabase.rpc("revise_legal_requirement", {
      p_existing_id: existingId,
      p_jurisdiction_id: input.jurisdictionId,
      p_asset_category: input.assetCategory,
      p_provider_id: input.providerId ?? null,
      p_requirement_type: input.requirementType,
      p_submission_channel: input.submissionChannel,
      p_submission_detail: input.submissionDetail ?? null,
      p_display_order: input.displayOrder ?? 0,
      p_notes: input.notes ?? null,
      p_pending_counsel_review: input.pendingCounselReview ?? false,
    });
    if (error) throw error;
    return toLegalRequirement(data as LegalRequirementRow);
  }
}
