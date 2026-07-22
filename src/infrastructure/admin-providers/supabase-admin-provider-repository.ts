import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssetCategory } from "@/domain/assets/ports";
import type {
  AdminProvider,
  AdminProviderRepository,
  CreateProviderInput,
  UpdateProviderInput,
} from "@/domain/admin-providers/ports";

interface ProviderRow {
  id: string;
  name: string;
  default_category: AssetCategory;
  website_url: string | null;
  notes: string | null;
}

function toAdminProvider(row: ProviderRow): AdminProvider {
  return {
    id: row.id,
    name: row.name,
    defaultCategory: row.default_category,
    websiteUrl: row.website_url,
    notes: row.notes,
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
