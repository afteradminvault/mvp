import { ASSET_CATEGORIES } from "@/domain/assets/asset-service";
import type { AssetCategory } from "@/domain/assets/ports";
import type { Platform, PlatformRepository } from "./ports";

export const MAX_SEARCH_LENGTH = 200;

export class InvalidPlatformInputError extends Error {}
export class PlatformNotFoundError extends Error {}

function validateSearch(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new InvalidPlatformInputError("search must be a string.");
  }
  const trimmed = value.trim();
  if (trimmed.length > MAX_SEARCH_LENGTH) {
    throw new InvalidPlatformInputError(`search must be ${MAX_SEARCH_LENGTH} characters or fewer.`);
  }
  return trimmed.length > 0 ? trimmed : undefined;
}

function validateCategory(value: unknown): AssetCategory | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !ASSET_CATEGORIES.includes(value as AssetCategory)) {
    throw new InvalidPlatformInputError(`category must be one of: ${ASSET_CATEGORIES.join(", ")}.`);
  }
  return value as AssetCategory;
}

/** Thin orchestration, matching every other domain's layering — validates query params only, no RLS/authorization logic of its own (providers_select_all already permits any authenticated read). */
export class PlatformService {
  constructor(private readonly repository: PlatformRepository) {}

  async listCommonOnboardingPlatforms(): Promise<Platform[]> {
    return this.repository.listCommonOnboardingPlatforms();
  }

  /** US-5.1 — search/browse the full catalog by name substring and/or category. */
  async searchPlatforms(filter: { search?: unknown; category?: unknown }): Promise<Platform[]> {
    const search = validateSearch(filter.search);
    const category = validateCategory(filter.category);
    return this.repository.searchPlatforms({ search, category });
  }

  /** US-5.2 — a single platform's closure instructions/method/bereavement contacts. */
  async getPlatform(id: string): Promise<Platform> {
    const platform = await this.repository.getPlatform(id);
    if (!platform) {
      throw new PlatformNotFoundError("Platform not found.");
    }
    return platform;
  }
}
