import type { AssetCategory } from "@/domain/assets/ports";
import type { ClosureMethod } from "@/domain/admin-providers/ports";

/**
 * Read-only public view over `providers` (Database Schema §3.1 + PRD v2
 * §3.3's platform-catalog fields, US-2.4) — the onboarding checklist's
 * curated common subset, not the full admin-managed catalog. Framework-free,
 * same rationale as the other ports.ts files.
 */
export interface Platform {
  id: string;
  name: string;
  defaultCategory: AssetCategory;
  logoUrl: string | null;
  closureMethod: ClosureMethod | null;
}

export interface PlatformRepository {
  listCommonOnboardingPlatforms(): Promise<Platform[]>;
}
