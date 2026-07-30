import type { Platform, PlatformRepository } from "./ports";

/** Thin orchestration, matching every other domain's layering — no validation needed for a pure read. */
export class PlatformService {
  constructor(private readonly repository: PlatformRepository) {}

  async listCommonOnboardingPlatforms(): Promise<Platform[]> {
    return this.repository.listCommonOnboardingPlatforms();
  }
}
