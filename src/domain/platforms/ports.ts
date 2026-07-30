import type { AssetCategory } from "@/domain/assets/ports";
import type { ClosureMethod } from "@/domain/admin-providers/ports";

/**
 * Read-only public view over `providers` (Database Schema §3.1 + PRD v2
 * §3.3/§3.5's platform-catalog fields, US-2.4 + US-5.1/5.2) — the same
 * underlying table as the admin-managed catalog, narrowed to what any
 * authenticated family member may read. Framework-free, same rationale as
 * the other ports.ts files.
 */
export interface Platform {
  id: string;
  name: string;
  defaultCategory: AssetCategory;
  logoUrl: string | null;
  closureMethod: ClosureMethod | null;
  closureInstructions: string | null;
  bereavementContactEmail: string | null;
  bereavementContactPhone: string | null;
  bereavementInstructionsUrl: string | null;
  websiteUrl: string | null;
  /** US-6.2 — whether "memorialize" is a valid letter_type choice for this platform. */
  supportsMemorialize: boolean;
}

export interface PlatformSearchFilter {
  search?: string;
  category?: AssetCategory;
}

export interface PlatformRepository {
  listCommonOnboardingPlatforms(): Promise<Platform[]>;
  /** US-5.1 — searches the full catalog (not just the onboarding-curated subset), by name substring and/or category. */
  searchPlatforms(filter: PlatformSearchFilter): Promise<Platform[]>;
  /** US-5.2 — a single platform's full detail, for the closure-instructions view. */
  getPlatform(id: string): Promise<Platform | null>;
}
