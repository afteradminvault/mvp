import type {
  AdminJurisdiction,
  AdminJurisdictionRepository,
  CreateJurisdictionInput,
  UpdateJurisdictionInput,
} from "./ports";

export const MAX_DISPLAY_NAME_LENGTH = 200;

export class InvalidJurisdictionInputError extends Error {}
export class JurisdictionForbiddenError extends Error {}

const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;

function validateCountryCode(countryCode: unknown): string {
  if (typeof countryCode !== "string" || !COUNTRY_CODE_PATTERN.test(countryCode)) {
    throw new InvalidJurisdictionInputError("countryCode must be a 2-letter ISO 3166-1 alpha-2 code.");
  }
  return countryCode;
}

function validateDisplayName(displayName: unknown): string {
  if (typeof displayName !== "string" || displayName.trim().length === 0) {
    throw new InvalidJurisdictionInputError("displayName is required.");
  }
  const trimmed = displayName.trim();
  if (trimmed.length > MAX_DISPLAY_NAME_LENGTH) {
    throw new InvalidJurisdictionInputError(`displayName must be ${MAX_DISPLAY_NAME_LENGTH} characters or fewer.`);
  }
  return trimmed;
}

function translateRepositoryError(error: unknown): never {
  // Real Postgres RLS WITH CHECK violation text (jurisdictions_admin_write,
  // supabase/migrations/20260719120100_rls_policies.sql) — this is a
  // defense-in-depth fallback; the primary gate is requirePlatformAdmin()
  // at the route layer, which should reject non-admins before this ever runs.
  if (error instanceof Error && /row-level security|permission denied/i.test(error.message)) {
    throw new JurisdictionForbiddenError("Only platform admins can manage jurisdictions.");
  }
  throw error;
}

/**
 * No delete: jurisdictions are referenced by estates and legal_requirements
 * with ON DELETE RESTRICT — hiding one from the Planner picker is
 * `isSupported = false`, not removal.
 */
export class AdminJurisdictionService {
  constructor(private readonly repository: AdminJurisdictionRepository) {}

  async createJurisdiction(input: CreateJurisdictionInput): Promise<AdminJurisdiction> {
    const countryCode = validateCountryCode(input.countryCode);
    const displayName = validateDisplayName(input.displayName);
    const regionCode =
      input.regionCode === undefined || input.regionCode === null ? null : input.regionCode.trim() || null;

    try {
      return await this.repository.createJurisdiction({
        countryCode,
        regionCode,
        displayName,
        isSupported: input.isSupported ?? false,
      });
    } catch (error) {
      translateRepositoryError(error);
    }
  }

  async listJurisdictions(): Promise<AdminJurisdiction[]> {
    try {
      return await this.repository.listJurisdictions();
    } catch (error) {
      translateRepositoryError(error);
    }
  }

  async updateJurisdiction(id: string, input: UpdateJurisdictionInput): Promise<AdminJurisdiction> {
    const patch: UpdateJurisdictionInput = {};
    if (input.displayName !== undefined) {
      patch.displayName = validateDisplayName(input.displayName);
    }
    if (input.isSupported !== undefined) {
      patch.isSupported = input.isSupported;
    }
    if (Object.keys(patch).length === 0) {
      throw new InvalidJurisdictionInputError("No valid fields to update.");
    }

    try {
      return await this.repository.updateJurisdiction(id, patch);
    } catch (error) {
      translateRepositoryError(error);
    }
  }
}
