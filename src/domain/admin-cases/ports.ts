/**
 * Admin case oversight/flagging domain contracts (Database Schema §2.1,
 * PRD v2 §3.8, US-8.3). Framework-free, same rationale as the other
 * ports.ts files. Deliberately narrow — case metadata only, never asset
 * or vault-item content.
 */
export interface AdminCaseSummary {
  id: string;
  displayName: string;
  status: string;
  flagged: boolean;
  flaggedNotes: string | null;
  createdAt: string;
}

export interface ListAdminCasesFilter {
  flaggedOnly?: boolean;
  limit: number;
  offset: number;
}

export interface AdminCaseListResult {
  cases: AdminCaseSummary[];
  total: number;
}

export interface FlagCaseInput {
  flagged: boolean;
  flaggedNotes?: string | null;
}

export interface AdminCaseRepository {
  listCases(filter: ListAdminCasesFilter): Promise<AdminCaseListResult>;
  flagCase(caseId: string, input: FlagCaseInput): Promise<AdminCaseSummary>;
}
