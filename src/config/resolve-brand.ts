import type { NextRequest } from "next/server";
import { DEFAULT_BRAND_ID, isBrandId, type BrandId } from "./brand-config";

const HOSTNAME_BRAND_MAP: Record<string, BrandId> = {
  "afteradmin.co": "afteradmin",
  "www.afteradmin.co": "afteradmin",
  "aftervault.co": "aftervault",
  "www.aftervault.co": "aftervault",
};

export const BRAND_OVERRIDE_COOKIE = "av_brand_override";

/**
 * Production: exact hostname match. Anything else (local dev, preview
 * deploys) falls back to an explicit override — a `?brand=` query param,
 * then a cookie the query param sets — so brand-switching never needs real
 * DNS (Roadmap Addendum's Milestone 0 exit criteria). Falls back to
 * DEFAULT_BRAND_ID (aftervault) — this app's only brand before this change.
 */
export function resolveBrandId(request: NextRequest): BrandId {
  const hostname = request.nextUrl.hostname.toLowerCase();
  if (hostname in HOSTNAME_BRAND_MAP) {
    return HOSTNAME_BRAND_MAP[hostname];
  }

  const queryOverride = request.nextUrl.searchParams.get("brand");
  if (isBrandId(queryOverride)) {
    return queryOverride;
  }

  const cookieOverride = request.cookies.get(BRAND_OVERRIDE_COOKIE)?.value;
  if (isBrandId(cookieOverride)) {
    return cookieOverride;
  }

  return DEFAULT_BRAND_ID;
}
