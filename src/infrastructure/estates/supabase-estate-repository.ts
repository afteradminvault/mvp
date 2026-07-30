import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CreateDraftCaseInput,
  CreateEstateInput,
  Estate,
  EstateRepository,
  EstateStatus,
  Jurisdiction,
  SaveDraftProgressInput,
  UpdateEstateInput,
} from "@/domain/estates/ports";

export interface EstateRow {
  id: string;
  owner_user_id: string | null;
  jurisdiction_id: string;
  display_name: string;
  status: EstateStatus;
  check_in_interval_days: number;
  last_check_in_at: string;
  grace_period_days: number;
  verification_started_at: string | null;
  self_cancel_window_days: number;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  deceased_full_name: string | null;
  deceased_date_of_birth: string | null;
  deceased_relationship: string | null;
  deceased_date_of_death: string | null;
  draft_step: string | null;
  draft_payload: Record<string, unknown>;
}

interface JurisdictionRow {
  id: string;
  country_code: string;
  region_code: string | null;
  display_name: string;
}

export function toEstate(row: EstateRow): Estate {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    jurisdictionId: row.jurisdiction_id,
    displayName: row.display_name,
    status: row.status,
    checkInIntervalDays: row.check_in_interval_days,
    lastCheckInAt: row.last_check_in_at,
    gracePeriodDays: row.grace_period_days,
    verificationStartedAt: row.verification_started_at,
    selfCancelWindowDays: row.self_cancel_window_days,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at,
    deceasedFullName: row.deceased_full_name,
    deceasedDateOfBirth: row.deceased_date_of_birth,
    deceasedRelationship: row.deceased_relationship,
    deceasedDateOfDeath: row.deceased_date_of_death,
    draftStep: row.draft_step,
    draftPayload: row.draft_payload,
  };
}

function toJurisdiction(row: JurisdictionRow): Jurisdiction {
  return {
    id: row.id,
    countryCode: row.country_code,
    regionCode: row.region_code,
    displayName: row.display_name,
  };
}

/**
 * Concrete adapter against Supabase. Table is `cases` at the DB level
 * (renamed from `estates` per PRD v2 §0 —
 * supabase/migrations/20260730000000_rename_estates_to_cases.sql); kept as
 * `Estate`/`EstateRepository` at the TypeScript level for this pass, per
 * the agreed Milestone 0 scope (only membership/auth/tier-selection code
 * gets the full case/estate terminology sweep; this repository is the one
 * exception, since it owns the `.from("cases")`/RPC calls directly).
 * Creation goes through the create_case() SECURITY DEFINER RPC
 * (supabase/migrations/20260730000100_case_member_role_and_rls.sql, was
 * create_estate()) rather than a bare table insert, because RLS
 * deliberately has no INSERT policy on cases/case_members — the RPC is the
 * only way to atomically create both rows (see
 * docs/SECURITY_ARCHITECTURE.md §3.2).
 */
export class SupabaseEstateRepository implements EstateRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async createEstate(input: CreateEstateInput): Promise<Estate> {
    const { data, error } = await this.supabase.rpc("create_case", {
      p_display_name: input.displayName,
      p_jurisdiction_id: input.jurisdictionId,
      ...(input.checkInIntervalDays !== undefined
        ? { p_check_in_interval_days: input.checkInIntervalDays }
        : {}),
    });
    if (error) throw error;
    return toEstate(data as EstateRow);
  }

  async getEstate(estateId: string): Promise<Estate | null> {
    const { data, error } = await this.supabase
      .from("cases")
      .select("*")
      .eq("id", estateId)
      .maybeSingle();
    if (error) throw error;
    return data ? toEstate(data as EstateRow) : null;
  }

  async updateEstate(estateId: string, input: UpdateEstateInput): Promise<Estate> {
    const patch: Record<string, unknown> = {};
    if (input.displayName !== undefined) patch.display_name = input.displayName;
    if (input.checkInIntervalDays !== undefined) patch.check_in_interval_days = input.checkInIntervalDays;
    if (input.gracePeriodDays !== undefined) patch.grace_period_days = input.gracePeriodDays;

    const { data, error } = await this.supabase
      .from("cases")
      .update(patch)
      .eq("id", estateId)
      .select("*")
      .single();
    if (error) throw error;
    return toEstate(data as EstateRow);
  }

  async recordCheckIn(estateId: string): Promise<Estate> {
    const { data, error } = await this.supabase
      .from("cases")
      .update({ last_check_in_at: new Date().toISOString() })
      .eq("id", estateId)
      .select("*")
      .single();
    if (error) throw error;
    return toEstate(data as EstateRow);
  }

  async listMyEstates(): Promise<Estate[]> {
    const { data, error } = await this.supabase
      .from("cases")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data as EstateRow[]).map(toEstate);
  }

  async listSupportedJurisdictions(): Promise<Jurisdiction[]> {
    const { data, error } = await this.supabase
      .from("jurisdictions")
      .select("id, country_code, region_code, display_name")
      .eq("is_supported", true)
      .order("display_name", { ascending: true });
    if (error) throw error;
    return (data as JurisdictionRow[]).map(toJurisdiction);
  }

  async createDraftCase(input: CreateDraftCaseInput): Promise<Estate> {
    const { data, error } = await this.supabase.rpc("create_draft_case", {
      p_jurisdiction_id: input.jurisdictionId,
      p_deceased_full_name: input.deceasedFullName,
      p_deceased_date_of_birth: input.deceasedDateOfBirth,
      p_deceased_relationship: input.deceasedRelationship,
      ...(input.deceasedDateOfDeath !== undefined ? { p_deceased_date_of_death: input.deceasedDateOfDeath } : {}),
      ...(input.checkInIntervalDays !== undefined
        ? { p_check_in_interval_days: input.checkInIntervalDays }
        : {}),
    });
    if (error) throw error;
    return toEstate(data as EstateRow);
  }

  /** draft_payload is written as a full replacement here — the service layer is responsible for merging with the existing value first. */
  async saveDraftProgress(estateId: string, input: SaveDraftProgressInput): Promise<Estate> {
    const { data, error } = await this.supabase
      .from("cases")
      .update({ draft_step: input.draftStep, draft_payload: input.draftPayload })
      .eq("id", estateId)
      .select("*")
      .single();
    if (error) throw error;
    return toEstate(data as EstateRow);
  }

  async activateDraftCase(estateId: string): Promise<Estate> {
    const { data, error } = await this.supabase.rpc("activate_draft_case", { p_case_id: estateId });
    if (error) throw error;
    return toEstate(data as EstateRow);
  }
}
