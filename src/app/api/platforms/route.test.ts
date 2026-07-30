import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Platform, PlatformRepository } from "@/domain/platforms/ports";
import { GET } from "./route";

const requireSessionMock = vi.fn();
vi.mock("@/app/api/_lib/require-session", () => ({
  requireSession: () => requireSessionMock(),
}));

let fakeRepository: PlatformRepository;
vi.mock("@/infrastructure/platforms/supabase-platform-repository", () => ({
  SupabasePlatformRepository: vi.fn().mockImplementation(function SupabasePlatformRepository() {
    return fakeRepository;
  }),
}));

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

beforeEach(() => {
  vi.clearAllMocks();
  fakeRepository = {
    listCommonOnboardingPlatforms: vi.fn().mockResolvedValue([]),
    searchPlatforms: vi.fn().mockResolvedValue([]),
    getPlatform: vi.fn(),
  };
  requireSessionMock.mockResolvedValue({ supabase: {}, userId: "user-1" });
});

describe("GET /api/platforms", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });

    const response = await GET(new Request("http://localhost/api/platforms"));
    expect(response.status).toBe(401);
  });

  it("returns the curated onboarding platform list when there are no query params", async () => {
    const platforms = [makePlatform()];
    fakeRepository.listCommonOnboardingPlatforms = vi.fn().mockResolvedValue(platforms);

    const response = await GET(new Request("http://localhost/api/platforms"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.platforms).toEqual(platforms);
    expect(fakeRepository.searchPlatforms).not.toHaveBeenCalled();
  });

  it("searches the full catalog when ?search= is given", async () => {
    const platforms = [makePlatform({ name: "Chase", defaultCategory: "financial" })];
    fakeRepository.searchPlatforms = vi.fn().mockResolvedValue(platforms);

    const response = await GET(new Request("http://localhost/api/platforms?search=chase"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.platforms).toEqual(platforms);
    expect(fakeRepository.searchPlatforms).toHaveBeenCalledWith({ search: "chase", category: undefined });
    expect(fakeRepository.listCommonOnboardingPlatforms).not.toHaveBeenCalled();
  });

  it("searches by ?category= alone", async () => {
    fakeRepository.searchPlatforms = vi.fn().mockResolvedValue([]);

    await GET(new Request("http://localhost/api/platforms?category=financial"));

    expect(fakeRepository.searchPlatforms).toHaveBeenCalledWith({ search: undefined, category: "financial" });
  });

  it("returns 400 for an invalid category (via the real PlatformService validation)", async () => {
    const response = await GET(new Request("http://localhost/api/platforms?category=not-a-category"));
    expect(response.status).toBe(400);
    expect(fakeRepository.searchPlatforms).not.toHaveBeenCalled();
  });
});
