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
  /** Family-facing step-by-step closure instructions (US-5.2) — distinct from `notes`, which is staff-internal only. */
  closureInstructions: string | null;
  bereavementContactEmail: string | null;
  bereavementContactPhone: string | null;
  bereavementInstructionsUrl: string | null;
  logoUrl: string | null;
  isCommonOnboardingPlatform: boolean;
  /** US-6.2 — whether "memorialize" is a valid letter_type choice for this platform. */
  supportsMemorialize: boolean;
  /** US-8.4 — retiring a platform sets this false rather than a hard delete, preserving legal_requirements/asset history that references it. */
  isActive: boolean;
}

export interface CreateProviderInput {
  name: string;
  defaultCategory: AssetCategory;
  websiteUrl?: string | null;
  notes?: string | null;
  closureMethod?: ClosureMethod | null;
  closureInstructions?: string | null;
  bereavementContactEmail?: string | null;
  bereavementContactPhone?: string | null;
  bereavementInstructionsUrl?: string | null;
  logoUrl?: string | null;
  isCommonOnboardingPlatform?: boolean;
  supportsMemorialize?: boolean;
  isActive?: boolean;
}

export interface UpdateProviderInput {
  name?: string;
  defaultCategory?: AssetCategory;
  websiteUrl?: string | null;
  notes?: string | null;
  closureMethod?: ClosureMethod | null;
  closureInstructions?: string | null;
  bereavementContactEmail?: string | null;
  bereavementContactPhone?: string | null;
  bereavementInstructionsUrl?: string | null;
  logoUrl?: string | null;
  isCommonOnboardingPlatform?: boolean;
  supportsMemorialize?: boolean;
  isActive?: boolean;
}

export interface AdminProviderRepository {
  createProvider(input: CreateProviderInput): Promise<AdminProvider>;
  listProviders(): Promise<AdminProvider[]>;
  updateProvider(id: string, input: UpdateProviderInput): Promise<AdminProvider>;
}
