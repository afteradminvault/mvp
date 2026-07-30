import type { AdminCaseListResult, AdminCaseRepository, AdminCaseSummary, ListAdminCasesFilter } from "./ports";

export const DEFAULT_CASE_LIMIT = 50;
export const MAX_CASE_LIMIT = 100;
export const MAX_FLAGGED_NOTES_LENGTH = 2000;

export class InvalidAdminCaseInputError extends Error {}

function validateLimit(value: unknown): number {
  if (value === undefined || value === null || value === "") return DEFAULT_CASE_LIMIT;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_CASE_LIMIT) {
    throw new InvalidAdminCaseInputError(`limit must be an integer between 1 and ${MAX_CASE_LIMIT}.`);
  }
  return parsed;
}

function validateOffset(value: unknown): number {
  if (value === undefined || value === null || value === "") return 0;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new InvalidAdminCaseInputError("offset must be a non-negative integer.");
  }
  return parsed;
}

function validateFlagged(value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw new InvalidAdminCaseInputError("flagged must be a boolean.");
  }
  return value;
}

function validateFlaggedNotes(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new InvalidAdminCaseInputError("flaggedNotes must be a string.");
  }
  if (value.length > MAX_FLAGGED_NOTES_LENGTH) {
    throw new InvalidAdminCaseInputError(`flaggedNotes must be ${MAX_FLAGGED_NOTES_LENGTH} characters or fewer.`);
  }
  return value;
}

/** Orchestrates admin Case oversight (US-8.3). Real authorization is entirely RLS-backed (cases_select_admin/cases_update_admin) — this service only validates input. */
export class AdminCaseService {
  constructor(private readonly repository: AdminCaseRepository) {}

  async listCases(query: { flaggedOnly?: unknown; limit?: unknown; offset?: unknown }): Promise<AdminCaseListResult> {
    const filter: ListAdminCasesFilter = {
      flaggedOnly: query.flaggedOnly === true || query.flaggedOnly === "true",
      limit: validateLimit(query.limit),
      offset: validateOffset(query.offset),
    };
    return this.repository.listCases(filter);
  }

  async flagCase(caseId: string, input: { flagged: unknown; flaggedNotes?: unknown }): Promise<AdminCaseSummary> {
    const flagged = validateFlagged(input.flagged);
    const flaggedNotes = validateFlaggedNotes(input.flaggedNotes);
    return this.repository.flagCase(caseId, { flagged, ...(flaggedNotes !== undefined ? { flaggedNotes } : {}) });
  }
}
