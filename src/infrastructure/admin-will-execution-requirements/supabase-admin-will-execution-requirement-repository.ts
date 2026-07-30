import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ListWillExecutionRequirementsFilter,
  WillExecutionRequirement,
  WillExecutionRequirementContentInput,
  WillExecutionRequirementRepository,
} from "@/domain/admin-will-execution-requirements/ports";

interface WillExecutionRequirementRow {
  id: string;
  jurisdiction_id: string;
  witness_count: number;
  notarization_required: boolean;
  self_proving_affidavit_available: boolean;
  holographic_wills_allowed: boolean;
  execution_instructions: string;
  effective_date: string;
  superseded_by_id: string | null;
  notes: string | null;
  pending_counsel_review: boolean;
  created_at: string;
  updated_at: string;
}

function toWillExecutionRequirement(row: WillExecutionRequirementRow): WillExecutionRequirement {
  return {
    id: row.id,
    jurisdictionId: row.jurisdiction_id,
    witnessCount: row.witness_count,
    notarizationRequired: row.notarization_required,
    selfProvingAffidavitAvailable: row.self_proving_affidavit_available,
    holographicWillsAllowed: row.holographic_wills_allowed,
    executionInstructions: row.execution_instructions,
    effectiveDate: row.effective_date,
    supersededById: row.superseded_by_id,
    notes: row.notes,
    pendingCounselReview: row.pending_counsel_review,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SupabaseAdminWillExecutionRequirementRepository implements WillExecutionRequirementRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async createRequirement(input: WillExecutionRequirementContentInput): Promise<WillExecutionRequirement> {
    const { data, error } = await this.supabase
      .from("will_execution_requirements")
      .insert({
        jurisdiction_id: input.jurisdictionId,
        witness_count: input.witnessCount ?? 2,
        notarization_required: input.notarizationRequired ?? false,
        self_proving_affidavit_available: input.selfProvingAffidavitAvailable ?? false,
        holographic_wills_allowed: input.holographicWillsAllowed ?? false,
        execution_instructions: input.executionInstructions,
        notes: input.notes ?? null,
        pending_counsel_review: input.pendingCounselReview ?? true,
      })
      .select("*")
      .single();
    if (error) throw error;
    return toWillExecutionRequirement(data as WillExecutionRequirementRow);
  }

  async listRequirements(filter?: ListWillExecutionRequirementsFilter): Promise<WillExecutionRequirement[]> {
    let query = this.supabase.from("will_execution_requirements").select("*");
    if (filter?.jurisdictionId !== undefined) {
      query = query.eq("jurisdiction_id", filter.jurisdictionId);
    }
    if (!filter?.includeSuperseded) {
      query = query.is("superseded_by_id", null);
    }
    const { data, error } = await query.order("jurisdiction_id", { ascending: true });
    if (error) throw error;
    return (data as WillExecutionRequirementRow[]).map(toWillExecutionRequirement);
  }

  async getRequirement(id: string): Promise<WillExecutionRequirement | null> {
    const { data, error } = await this.supabase
      .from("will_execution_requirements")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? toWillExecutionRequirement(data as WillExecutionRequirementRow) : null;
  }

  async reviseRequirement(
    existingId: string,
    input: WillExecutionRequirementContentInput,
  ): Promise<WillExecutionRequirement> {
    const { data, error } = await this.supabase.rpc("revise_will_execution_requirement", {
      p_existing_id: existingId,
      p_jurisdiction_id: input.jurisdictionId,
      p_witness_count: input.witnessCount ?? 2,
      p_notarization_required: input.notarizationRequired ?? false,
      p_self_proving_affidavit_available: input.selfProvingAffidavitAvailable ?? false,
      p_holographic_wills_allowed: input.holographicWillsAllowed ?? false,
      p_execution_instructions: input.executionInstructions,
      p_notes: input.notes ?? null,
      p_pending_counsel_review: input.pendingCounselReview ?? true,
    });
    if (error) throw error;
    return toWillExecutionRequirement(data as WillExecutionRequirementRow);
  }
}
