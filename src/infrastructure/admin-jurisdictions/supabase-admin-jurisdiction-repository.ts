import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AdminJurisdiction,
  AdminJurisdictionRepository,
  CreateJurisdictionInput,
  UpdateJurisdictionInput,
} from "@/domain/admin-jurisdictions/ports";

interface JurisdictionRow {
  id: string;
  country_code: string;
  region_code: string | null;
  display_name: string;
  is_supported: boolean;
}

function toAdminJurisdiction(row: JurisdictionRow): AdminJurisdiction {
  return {
    id: row.id,
    countryCode: row.country_code,
    regionCode: row.region_code,
    displayName: row.display_name,
    isSupported: row.is_supported,
  };
}

/** RLS (jurisdictions_admin_write) enforces the actual authorization; requirePlatformAdmin() at the route layer is the primary gate — see the service's translateRepositoryError comment. */
export class SupabaseAdminJurisdictionRepository implements AdminJurisdictionRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async createJurisdiction(input: CreateJurisdictionInput): Promise<AdminJurisdiction> {
    const { data, error } = await this.supabase
      .from("jurisdictions")
      .insert({
        country_code: input.countryCode,
        region_code: input.regionCode ?? null,
        display_name: input.displayName,
        is_supported: input.isSupported ?? false,
      })
      .select("*")
      .single();
    if (error) throw error;
    return toAdminJurisdiction(data as JurisdictionRow);
  }

  async listJurisdictions(): Promise<AdminJurisdiction[]> {
    const { data, error } = await this.supabase
      .from("jurisdictions")
      .select("*")
      .order("country_code", { ascending: true })
      .order("region_code", { ascending: true, nullsFirst: true });
    if (error) throw error;
    return (data as JurisdictionRow[]).map(toAdminJurisdiction);
  }

  async updateJurisdiction(id: string, input: UpdateJurisdictionInput): Promise<AdminJurisdiction> {
    const patch: Record<string, unknown> = {};
    if (input.displayName !== undefined) patch.display_name = input.displayName;
    if (input.isSupported !== undefined) patch.is_supported = input.isSupported;

    const { data, error } = await this.supabase
      .from("jurisdictions")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return toAdminJurisdiction(data as JurisdictionRow);
  }
}
