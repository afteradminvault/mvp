import type { AssetCategory } from "@/domain/assets/ports";

/**
 * Admin providers domain contracts (Database Schema §3.1, API
 * Specification §8). Framework-free, same rationale as other ports.ts
 * files. The closure/bereavement/onboarding fields are PRD v2 §3.3's
 * platform-catalog additions (US-2.4) — providers doubles as both the
 * asset-creation reference table and the account-closure catalog.
 */

export type ClosureMethod = "online_form" | "email" | "phone" | "automatic";

export interface AdminProvider {
  id: string;
  name: string;
  defaultCategory: AssetCategory;
  websiteUrl: string | null;
  notes: string | null;
  closureMethod: ClosureMethod | null;
  bereavementContactEmail: string | null;
  bereavementContactPhone: string | null;
  bereavementInstructionsUrl: string | null;
  logoUrl: string | null;
  isCommonOnboardingPlatform: boolean;
}

export interface CreateProviderInput {
  name: string;
  defaultCategory: AssetCategory;
  websiteUrl?: string | null;
  notes?: string | null;
  closureMethod?: ClosureMethod | null;
  bereavementContactEmail?: string | null;
  bereavementContactPhone?: string | null;
  bereavementInstructionsUrl?: string | null;
  logoUrl?: string | null;
  isCommonOnboardingPlatform?: boolean;
}

export interface UpdateProviderInput {
  name?: string;
  defaultCategory?: AssetCategory;
  websiteUrl?: string | null;
  notes?: string | null;
  closureMethod?: ClosureMethod | null;
  bereavementContactEmail?: string | null;
  bereavementContactPhone?: string | null;
  bereavementInstructionsUrl?: string | null;
  logoUrl?: string | null;
  isCommonOnboardingPlatform?: boolean;
}

export interface AdminProviderRepository {
  createProvider(input: CreateProviderInput): Promise<AdminProvider>;
  listProviders(): Promise<AdminProvider[]>;
  updateProvider(id: string, input: UpdateProviderInput): Promise<AdminProvider>;
}
