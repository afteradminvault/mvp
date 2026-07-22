import type { AssetCategory } from "@/domain/assets/ports";

/**
 * Admin providers domain contracts (Database Schema §3.1, API
 * Specification §8). Framework-free, same rationale as other ports.ts
 * files.
 */

export interface AdminProvider {
  id: string;
  name: string;
  defaultCategory: AssetCategory;
  websiteUrl: string | null;
  notes: string | null;
}

export interface CreateProviderInput {
  name: string;
  defaultCategory: AssetCategory;
  websiteUrl?: string | null;
  notes?: string | null;
}

export interface UpdateProviderInput {
  name?: string;
  defaultCategory?: AssetCategory;
  websiteUrl?: string | null;
  notes?: string | null;
}

export interface AdminProviderRepository {
  createProvider(input: CreateProviderInput): Promise<AdminProvider>;
  listProviders(): Promise<AdminProvider[]>;
  updateProvider(id: string, input: UpdateProviderInput): Promise<AdminProvider>;
}
