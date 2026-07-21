import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AssetCategory,
  CreateDigitalAssetInput,
  DigitalAsset,
  DigitalAssetRepository,
  IntendedOutcome,
  ListDigitalAssetsFilter,
  UpdateDigitalAssetInput,
} from "@/domain/assets/ports";

interface AssetRow {
  id: string;
  estate_id: string;
  category: AssetCategory;
  provider_id: string | null;
  custom_provider_name: string | null;
  account_identifier: string | null;
  intended_outcome: IntendedOutcome;
  intended_outcome_notes: string | null;
  estimated_value_cents: number | null;
  currency: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

function toAsset(row: AssetRow): DigitalAsset {
  return {
    id: row.id,
    estateId: row.estate_id,
    category: row.category,
    providerId: row.provider_id,
    customProviderName: row.custom_provider_name,
    accountIdentifier: row.account_identifier,
    intendedOutcome: row.intended_outcome,
    intendedOutcomeNotes: row.intended_outcome_notes,
    estimatedValueCents: row.estimated_value_cents,
    currency: row.currency,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

/**
 * Concrete adapter against Supabase. Unlike estates, digital_assets has a
 * normal RLS INSERT policy (digital_assets_write_owner — Database Schema
 * §4.1/Security Architecture §3.2), so creation is a plain insert, not a
 * SECURITY DEFINER RPC.
 */
export class SupabaseDigitalAssetRepository implements DigitalAssetRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async createAsset(estateId: string, input: CreateDigitalAssetInput): Promise<DigitalAsset> {
    const { data, error } = await this.supabase
      .from("digital_assets")
      .insert({
        estate_id: estateId,
        category: input.category,
        provider_id: input.providerId ?? null,
        custom_provider_name: input.customProviderName ?? null,
        account_identifier: input.accountIdentifier ?? null,
        ...(input.intendedOutcome !== undefined ? { intended_outcome: input.intendedOutcome } : {}),
        intended_outcome_notes: input.intendedOutcomeNotes ?? null,
        estimated_value_cents: input.estimatedValueCents ?? null,
        currency: input.currency ?? null,
      })
      .select("*")
      .single();
    if (error) throw error;
    return toAsset(data as AssetRow);
  }

  async getAsset(assetId: string): Promise<DigitalAsset | null> {
    const { data, error } = await this.supabase
      .from("digital_assets")
      .select("*")
      .eq("id", assetId)
      .maybeSingle();
    if (error) throw error;
    return data ? toAsset(data as AssetRow) : null;
  }

  async updateAsset(assetId: string, input: UpdateDigitalAssetInput): Promise<DigitalAsset> {
    const patch: Record<string, unknown> = {};
    if (input.category !== undefined) patch.category = input.category;
    if (input.providerId !== undefined) patch.provider_id = input.providerId;
    if (input.customProviderName !== undefined) patch.custom_provider_name = input.customProviderName;
    if (input.accountIdentifier !== undefined) patch.account_identifier = input.accountIdentifier;
    if (input.intendedOutcome !== undefined) patch.intended_outcome = input.intendedOutcome;
    if (input.intendedOutcomeNotes !== undefined) patch.intended_outcome_notes = input.intendedOutcomeNotes;
    if (input.estimatedValueCents !== undefined) patch.estimated_value_cents = input.estimatedValueCents;
    if (input.currency !== undefined) patch.currency = input.currency;

    const { data, error } = await this.supabase
      .from("digital_assets")
      .update(patch)
      .eq("id", assetId)
      .select("*")
      .single();
    if (error) throw error;
    return toAsset(data as AssetRow);
  }

  async archiveAsset(assetId: string): Promise<DigitalAsset> {
    const { data, error } = await this.supabase
      .from("digital_assets")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", assetId)
      .select("*")
      .single();
    if (error) throw error;
    return toAsset(data as AssetRow);
  }

  async listAssets(estateId: string, filter?: ListDigitalAssetsFilter): Promise<DigitalAsset[]> {
    let query = this.supabase.from("digital_assets").select("*").eq("estate_id", estateId);
    if (filter?.category !== undefined) {
      query = query.eq("category", filter.category);
    }
    if (!filter?.includeArchived) {
      query = query.is("archived_at", null);
    }
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw error;
    return (data as AssetRow[]).map(toAsset);
  }
}
