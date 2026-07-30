import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssetCategory } from "@/domain/assets/ports";
import type { ClosureMethod } from "@/domain/admin-providers/ports";
import type { Platform, PlatformRepository, PlatformSearchFilter } from "@/domain/platforms/ports";

const SELECT_COLUMNS =
  "id, name, default_category, logo_url, closure_method, closure_instructions, bereavement_contact_email, bereavement_contact_phone, bereavement_instructions_url, website_url, supports_memorialize";

interface PlatformRow {
  id: string;
  name: string;
  default_category: AssetCategory;
  logo_url: string | null;
  closure_method: ClosureMethod | null;
  closure_instructions: string | null;
  bereavement_contact_email: string | null;
  bereavement_contact_phone: string | null;
  bereavement_instructions_url: string | null;
  website_url: string | null;
  supports_memorialize: boolean;
}

function toPlatform(row: PlatformRow): Platform {
  return {
    id: row.id,
    name: row.name,
    defaultCategory: row.default_category,
    logoUrl: row.logo_url,
    closureMethod: row.closure_method,
    closureInstructions: row.closure_instructions,
    bereavementContactEmail: row.bereavement_contact_email,
    bereavementContactPhone: row.bereavement_contact_phone,
    bereavementInstructionsUrl: row.bereavement_instructions_url,
    websiteUrl: row.website_url,
    supportsMemorialize: row.supports_memorialize,
  };
}

/** providers_select_all RLS already permits any authenticated (or anonymous) read — this just narrows the columns/rows to what each caller needs. */
export class SupabasePlatformRepository implements PlatformRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  /** Retired (is_active=false, US-8.4) platforms are excluded from browse/search/onboarding, but getPlatform() below deliberately isn't filtered — an existing asset or notification letter tied to a retired platform must still resolve its (frozen) closure instructions. */
  async listCommonOnboardingPlatforms(): Promise<Platform[]> {
    const { data, error } = await this.supabase
      .from("providers")
      .select("id, name, default_category, logo_url, closure_method, supports_memorialize")
      .eq("is_common_onboarding_platform", true)
      .eq("is_active", true)
      .order("name", { ascending: true });
    if (error) throw error;
    return (data as PlatformRow[]).map((row) => toPlatform({ ...emptyDetailFields, ...row }));
  }

  async searchPlatforms(filter: PlatformSearchFilter): Promise<Platform[]> {
    let query = this.supabase.from("providers").select(SELECT_COLUMNS).eq("is_active", true).order("name", { ascending: true });
    if (filter.search) {
      query = query.ilike("name", `%${filter.search}%`);
    }
    if (filter.category) {
      query = query.eq("default_category", filter.category);
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data as PlatformRow[]).map(toPlatform);
  }

  async getPlatform(id: string): Promise<Platform | null> {
    const { data, error } = await this.supabase.from("providers").select(SELECT_COLUMNS).eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? toPlatform(data as PlatformRow) : null;
  }
}

/** listCommonOnboardingPlatforms selects a narrower column set (unchanged, to keep its existing query minimal) — this fills in the detail fields it doesn't fetch so toPlatform's shape stays uniform. */
const emptyDetailFields = {
  closure_instructions: null,
  bereavement_contact_email: null,
  bereavement_contact_phone: null,
  bereavement_instructions_url: null,
  website_url: null,
} as const;
