/**
 * Two-Brand Foundation (Roadmap Addendum: Two-Brand Architecture, Milestone
 * 0 addition). Brand visual/copy config is application code, not database
 * data (Schema Addendum §1) — deliberately not a table, since it changes at
 * deploy time, not by end-user or admin action.
 */

export type BrandId = "afteradmin" | "aftervault";

export interface BrandConfig {
  brandId: BrandId;
  domain: string;
  displayName: string;
  tagline: string;
  logoWordmark: string;
  accentHue: "teal" | "indigo";
  defaultPostLoginRoute: string;
  /** Unused until /pricing exists (Milestone 6) — scaffolded ahead of the feature that reads it, same pattern as the optional vars in src/config/env.ts. */
  pricingPageEmphasis: string[];
  supportEmail: string;
}

const BRAND_CONFIGS: Record<BrandId, BrandConfig> = {
  afteradmin: {
    brandId: "afteradmin",
    domain: "afteradmin.co",
    displayName: "AfterAdmin",
    tagline: "Close a loved one's accounts, this week.",
    logoWordmark: "AfterAdmin",
    accentHue: "teal",
    defaultPostLoginRoute: "/estates",
    pricingPageEmphasis: ["closure-tracking", "platform-database", "notification-letters"],
    supportEmail: "support@afteradmin.co",
  },
  aftervault: {
    brandId: "aftervault",
    domain: "aftervault.co",
    displayName: "AfterVault",
    tagline: "Put your affairs in order, on your own timeline.",
    logoWordmark: "AfterVault",
    accentHue: "indigo",
    defaultPostLoginRoute: "/estates",
    pricingPageEmphasis: ["vault", "executor-verification", "will-builder"],
    supportEmail: "support@aftervault.co",
  },
};

/** This app's only brand before the two-brand split — every fallback resolves here. */
export const DEFAULT_BRAND_ID: BrandId = "aftervault";

export function getBrandConfigById(brandId: BrandId): BrandConfig {
  return BRAND_CONFIGS[brandId];
}

export function isBrandId(value: unknown): value is BrandId {
  return value === "afteradmin" || value === "aftervault";
}
