import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssetCategory } from "@/domain/assets/ports";
import type {
  AdminProvider,
  AdminProviderRepository,
  ClosureMethod,
  CreateProviderInput,
  UpdateProviderInput,
} from "@/domain/admin-providers/ports";

interface ProviderRow {
  id: string;
  name: string;
  default_category: AssetCategory;
  website_url: string | null;
  notes: string | null;
  closure_method: ClosureMethod | null;
  closure_instructions: string | null;
  bereavement_contact_email: string | null;
  bereavement_contact_phone: string | null;
  bereavement_instructions_url: string | null;
  logo_url: string | null;
  is_common_onboarding_platform: boolean;
  supports_memorialize: boolean;
  is_active: boolean;
}

function toAdminProvider(row: ProviderRow): AdminProvider {
  return {
    id: row.id,
    name: row.name,
    defaultCategory: row.default_category,
    websiteUrl: row.website_url,
    notes: row.notes,
    closureMethod: row.closure_method,
    closureInstructions: row.closure_instructions,
    bereavementContactEmail: row.bereavement_contact_email,
    bereavementContactPhone: row.bereavement_contact_phone,
    bereavementInstructionsUrl: row.bereavement_instructions_url,
    logoUrl: row.logo_url,
    isCommonOnboardingPlatform: row.is_common_onboarding_platform,
    supportsMemorialize: row.supports_memorialize,
    isActive: row.is_active,
  };
}

export class SupabaseAdminProviderRepository implements AdminProviderRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async createProvider(input: CreateProviderInput): Promise<AdminProvider> {
    const { data, error } = await this.supabase
      .from("providers")
      .insert({
        name: input.name,
        default_category: input.defaultCategory,
        website_url: input.websiteUrl ?? null,
        notes: input.notes ?? null,
        closure_method: input.closureMethod ?? null,
        closure_instructions: input.closureInstructions ?? null,
        bereavement_contact_email: input.bereavementContactEmail ?? null,
        bereavement_contact_phone: input.bereavementContactPhone ?? null,
        bereavement_instructions_url: input.bereavementInstructionsUrl ?? null,
        logo_url: input.logoUrl ?? null,
        ...(input.isCommonOnboardingPlatform !== undefined
          ? { is_common_onboarding_platform: input.isCommonOnboardingPlatform }
          : {}),
        ...(input.supportsMemorialize !== undefined ? { supports_memorialize: input.supportsMemorialize } : {}),
        ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
      })
      .select("*")
      .single();
    if (error) throw error;
    return toAdminProvider(data as ProviderRow);
  }

  async listProviders(): Promise<AdminProvider[]> {
    const { data, error } = await this.supabase.from("providers").select("*").order("name", { ascending: true });
    if (error) throw error;
    return (data as ProviderRow[]).map(toAdminProvider);
  }

  async updateProvider(id: string, input: UpdateProviderInput): Promise<AdminProvider> {
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.defaultCategory !== undefined) patch.default_category = input.defaultCategory;
    if (input.websiteUrl !== undefined) patch.website_url = input.websiteUrl;
    if (input.notes !== undefined) patch.notes = input.notes;
    if (input.closureMethod !== undefined) patch.closure_method = input.closureMethod;
    if (input.closureInstructions !== undefined) patch.closure_instructions = input.closureInstructions;
    if (input.bereavementContactEmail !== undefined) patch.bereavement_contact_email = input.bereavementContactEmail;
    if (input.bereavementContactPhone !== undefined) patch.bereavement_contact_phone = input.bereavementContactPhone;
    if (input.bereavementInstructionsUrl !== undefined)
      patch.bereavement_instructions_url = input.bereavementInstructionsUrl;
    if (input.logoUrl !== undefined) patch.logo_url = input.logoUrl;
    if (input.isCommonOnboardingPlatform !== undefined)
      patch.is_common_onboarding_platform = input.isCommonOnboardingPlatform;
    if (input.supportsMemorialize !== undefined) patch.supports_memorialize = input.supportsMemorialize;
    if (input.isActive !== undefined) patch.is_active = input.isActive;

    const { data, error } = await this.supabase
      .from("providers")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return toAdminProvider(data as ProviderRow);
  }
}
