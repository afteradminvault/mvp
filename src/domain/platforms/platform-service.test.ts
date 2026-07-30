import { describe, expect, it, vi } from "vitest";
import type { Platform, PlatformRepository } from "./ports";
import { PlatformService } from "./platform-service";

describe("PlatformService.listCommonOnboardingPlatforms", () => {
  it("delegates directly to the repository", async () => {
    const platforms: Platform[] = [
      { id: "provider-1", name: "Gmail", defaultCategory: "social", logoUrl: null, closureMethod: "online_form" },
    ];
    const repository: PlatformRepository = {
      listCommonOnboardingPlatforms: vi.fn().mockResolvedValue(platforms),
    };
    const service = new PlatformService(repository);

    await expect(service.listCommonOnboardingPlatforms()).resolves.toBe(platforms);
  });
});
