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

beforeEach(() => {
  vi.clearAllMocks();
  fakeRepository = { listCommonOnboardingPlatforms: vi.fn().mockResolvedValue([]) };
  requireSessionMock.mockResolvedValue({ supabase: {}, userId: "user-1" });
});

describe("GET /api/platforms", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });

    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("returns the curated onboarding platform list", async () => {
    const platforms: Platform[] = [
      { id: "provider-1", name: "Gmail", defaultCategory: "social", logoUrl: null, closureMethod: "online_form" },
    ];
    fakeRepository.listCommonOnboardingPlatforms = vi.fn().mockResolvedValue(platforms);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.platforms).toEqual(platforms);
  });
});
