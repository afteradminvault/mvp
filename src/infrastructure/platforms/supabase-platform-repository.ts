import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssetCategory } from "@/domain/assets/ports";
import type { ClosureMethod } from "@/domain/admin-providers/ports";
import type { Platform, PlatformRepository } from "@/domain/platforms/ports";

interface PlatformRow {
  id: string;
  name: string;
  default_category: AssetCategory;
  logo_url: string | null;
  closure_method: ClosureMethod | null;
}

function toPlatform(row: PlatformRow): Platform {
  return {
    id: row.id,
    name: row.name,
    defaultCategory: row.default_category,
    logoUrl: row.logo_url,
    closureMethod: row.closure_method,
  };
}

/** providers_select_all RLS already permits any authenticated (or anonymous) read — this just narrows the columns/rows to what the checklist needs. */
export class SupabasePlatformRepository implements PlatformRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async listCommonOnboardingPlatforms(): Promise<Platform[]> {
    const { data, error } = await this.supabase
      .from("providers")
      .select("id, name, default_category, logo_url, closure_method")
      .eq("is_common_onboarding_platform", true)
      .order("name", { ascending: true });
    if (error) throw error;
    return (data as PlatformRow[]).map(toPlatform);
  }
}
