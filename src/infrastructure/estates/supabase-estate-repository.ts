import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CreateEstateInput,
  Estate,
  EstateRepository,
  EstateStatus,
  Jurisdiction,
  UpdateEstateInput,
} from "@/domain/estates/ports";

interface EstateRow {
  id: string;
  owner_user_id: string;
  jurisdiction_id: string;
  display_name: string;
  status: EstateStatus;
  check_in_interval_days: number;
  last_check_in_at: string;
  grace_period_days: number;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

interface JurisdictionRow {
  id: string;
  country_code: string;
  region_code: string | null;
  display_name: string;
}

function toEstate(row: EstateRow): Estate {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    jurisdictionId: row.jurisdiction_id,
    displayName: row.display_name,
    status: row.status,
    checkInIntervalDays: row.check_in_interval_days,
    lastCheckInAt: row.last_check_in_at,
    gracePeriodDays: row.grace_period_days,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at,
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
 * Concrete adapter against Supabase. Creation goes through the
 * create_estate() SECURITY DEFINER RPC (supabase/migrations/20260719120100_rls_policies.sql)
 * rather than a bare table insert, because RLS deliberately has no INSERT
 * policy on estates/estate_members — the RPC is the only way to atomically
 * create both rows (see docs/SECURITY_ARCHITECTURE.md §3.2).
 */
export class SupabaseEstateRepository implements EstateRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async createEstate(input: CreateEstateInput): Promise<Estate> {
    const { data, error } = await this.supabase.rpc("create_estate", {
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
      .from("estates")
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
      .from("estates")
      .update(patch)
      .eq("id", estateId)
      .select("*")
      .single();
    if (error) throw error;
    return toEstate(data as EstateRow);
  }

  async recordCheckIn(estateId: string): Promise<Estate> {
    const { data, error } = await this.supabase
      .from("estates")
      .update({ last_check_in_at: new Date().toISOString() })
      .eq("id", estateId)
      .select("*")
      .single();
    if (error) throw error;
    return toEstate(data as EstateRow);
  }

  async listMyEstates(): Promise<Estate[]> {
    const { data, error } = await this.supabase
      .from("estates")
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
}
