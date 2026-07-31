import { headers } from "next/headers";
import { DEFAULT_BRAND_ID, getBrandConfigById, isBrandId, type BrandConfig } from "./brand-config";

export const BRAND_HEADER = "x-acquisition-brand";

/**
 * Server-only reader for Server Components/Server Actions — mirrors
 * src/config/env.ts's getServerEnv() pattern. Reads the header proxy.ts
 * already resolved, so no hostname/override logic is duplicated here.
 */
export async function getBrandConfig(): Promise<BrandConfig> {
  const headerList = await headers();
  const brandId = headerList.get(BRAND_HEADER);
  return getBrandConfigById(isBrandId(brandId) ? brandId : DEFAULT_BRAND_ID);
}
