import { describe, expect, it, vi } from "vitest";
import type { Platform, PlatformRepository } from "./ports";
import { InvalidPlatformInputError, PlatformNotFoundError, PlatformService } from "./platform-service";

function makePlatform(overrides: Partial<Platform> = {}): Platform {
  return {
    id: "provider-1",
    name: "Gmail",
    defaultCategory: "social",
    logoUrl: null,
    closureMethod: "online_form",
    closureInstructions: null,
    bereavementContactEmail: null,
    bereavementContactPhone: null,
    bereavementInstructionsUrl: null,
    websiteUrl: null,
    supportsMemorialize: false,
    ...overrides,
  };
}

function createFakeRepository(overrides: Partial<PlatformRepository> = {}): PlatformRepository {
  return {
    listCommonOnboardingPlatforms: vi.fn(),
    searchPlatforms: vi.fn(),
    getPlatform: vi.fn(),
    ...overrides,
  };
}

describe("PlatformService.listCommonOnboardingPlatforms", () => {
  it("delegates directly to the repository", async () => {
    const platforms = [makePlatform()];
    const repository = createFakeRepository({ listCommonOnboardingPlatforms: vi.fn().mockResolvedValue(platforms) });
    const service = new PlatformService(repository);

    await expect(service.listCommonOnboardingPlatforms()).resolves.toBe(platforms);
  });
});

describe("PlatformService.searchPlatforms", () => {
  it("passes through a trimmed search term and category", async () => {
    const platforms = [makePlatform({ name: "Chase", defaultCategory: "financial" })];
    const repository = createFakeRepository({ searchPlatforms: vi.fn().mockResolvedValue(platforms) });
    const service = new PlatformService(repository);

    const result = await service.searchPlatforms({ search: "  chase  ", category: "financial" });

    expect(repository.searchPlatforms).toHaveBeenCalledWith({ search: "chase", category: "financial" });
    expect(result).toBe(platforms);
  });

  it("passes undefined filters when neither search nor category is given", async () => {
    const repository = createFakeRepository({ searchPlatforms: vi.fn().mockResolvedValue([]) });
    const service = new PlatformService(repository);

    await service.searchPlatforms({});

    expect(repository.searchPlatforms).toHaveBeenCalledWith({ search: undefined, category: undefined });
  });

  it("rejects an invalid category", async () => {
    const repository = createFakeRepository();
    const service = new PlatformService(repository);

    await expect(service.searchPlatforms({ category: "not-a-category" })).rejects.toThrow(InvalidPlatformInputError);
  });
});

describe("PlatformService.getPlatform", () => {
  it("returns the platform when found", async () => {
    const platform = makePlatform();
    const repository = createFakeRepository({ getPlatform: vi.fn().mockResolvedValue(platform) });
    const service = new PlatformService(repository);

    await expect(service.getPlatform("provider-1")).resolves.toBe(platform);
  });

  it("throws PlatformNotFoundError when not found", async () => {
    const repository = createFakeRepository({ getPlatform: vi.fn().mockResolvedValue(null) });
    const service = new PlatformService(repository);

    await expect(service.getPlatform("nonexistent")).rejects.toThrow(PlatformNotFoundError);
  });
});
