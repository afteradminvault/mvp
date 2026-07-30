import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AdminCaseListResult,
  AdminCaseRepository,
  AdminCaseSummary,
  FlagCaseInput,
  ListAdminCasesFilter,
} from "@/domain/admin-cases/ports";

interface CaseRow {
  id: string;
  display_name: string;
  status: string;
  flagged: boolean;
  flagged_notes: string | null;
  created_at: string;
}

function toAdminCaseSummary(row: CaseRow): AdminCaseSummary {
  return {
    id: row.id,
    displayName: row.display_name,
    status: row.status,
    flagged: row.flagged,
    flaggedNotes: row.flagged_notes,
    createdAt: row.created_at,
  };
}

/** cases_select_admin/cases_update_admin RLS gates this to platform admins via the caller's own session client — see the migration's own comment. */
export class SupabaseAdminCaseRepository implements AdminCaseRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async listCases(filter: ListAdminCasesFilter): Promise<AdminCaseListResult> {
    let query = this.supabase
      .from("cases")
      .select("id, display_name, status, flagged, flagged_notes, created_at", { count: "exact" });
    if (filter.flaggedOnly) query = query.eq("flagged", true);

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(filter.offset, filter.offset + filter.limit - 1);
    if (error) throw error;
    return { cases: (data as CaseRow[]).map(toAdminCaseSummary), total: count ?? 0 };
  }

  async flagCase(caseId: string, input: FlagCaseInput): Promise<AdminCaseSummary> {
    const patch: Record<string, unknown> = { flagged: input.flagged };
    if (input.flaggedNotes !== undefined) patch.flagged_notes = input.flaggedNotes;

    const { data, error } = await this.supabase
      .from("cases")
      .update(patch)
      .eq("id", caseId)
      .select("id, display_name, status, flagged, flagged_notes, created_at")
      .single();
    if (error) throw error;
    return toAdminCaseSummary(data as CaseRow);
  }
}
