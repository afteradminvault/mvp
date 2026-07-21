/**
 * Digital asset domain contracts. Framework-free, same rationale as
 * src/domain/estates/ports.ts — src/infrastructure/assets/supabase-asset-repository.ts
 * implements this against Supabase. No vault content here (Database Schema
 * §4.1) — that's digital_vault_items, a separate table/feature.
 */

export type AssetCategory =
  | "financial"
  | "social"
  | "subscription"
  | "crypto"
  | "cloud_storage"
  | "domain"
  | "other";

export type IntendedOutcome = "close" | "transfer" | "memorialize" | "ignore" | "other";

export interface DigitalAsset {
  id: string;
  estateId: string;
  category: AssetCategory;
  providerId: string | null;
  customProviderName: string | null;
  accountIdentifier: string | null;
  intendedOutcome: IntendedOutcome;
  intendedOutcomeNotes: string | null;
  estimatedValueCents: number | null;
  currency: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface CreateDigitalAssetInput {
  category: AssetCategory;
  providerId?: string | null;
  customProviderName?: string | null;
  accountIdentifier?: string | null;
  intendedOutcome?: IntendedOutcome;
  intendedOutcomeNotes?: string | null;
  estimatedValueCents?: number | null;
  currency?: string | null;
}

export interface UpdateDigitalAssetInput {
  category?: AssetCategory;
  providerId?: string | null;
  customProviderName?: string | null;
  accountIdentifier?: string | null;
  intendedOutcome?: IntendedOutcome;
  intendedOutcomeNotes?: string | null;
  estimatedValueCents?: number | null;
  currency?: string | null;
}

export interface ListDigitalAssetsFilter {
  category?: AssetCategory;
  includeArchived?: boolean;
}

export interface DigitalAssetRepository {
  createAsset(estateId: string, input: CreateDigitalAssetInput): Promise<DigitalAsset>;
  getAsset(assetId: string): Promise<DigitalAsset | null>;
  updateAsset(assetId: string, input: UpdateDigitalAssetInput): Promise<DigitalAsset>;
  archiveAsset(assetId: string): Promise<DigitalAsset>;
  listAssets(estateId: string, filter?: ListDigitalAssetsFilter): Promise<DigitalAsset[]>;
}
