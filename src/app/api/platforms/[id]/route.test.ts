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
    name: "Chase",
    defaultCategory: "financial",
    logoUrl: null,
    closureMethod: "online_form",
    closureInstructions: "Call the bereavement line and provide a death certificate.",
    bereavementContactEmail: "bereavement@chase.example",
    bereavementContactPhone: "1-800-555-0100",
    bereavementInstructionsUrl: null,
    websiteUrl: "https://www.chase.com",
    supportsMemorialize: false,
    ...overrides,
  };
}

function routeParams(id = "provider-1") {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeRepository = {
    listCommonOnboardingPlatforms: vi.fn(),
    searchPlatforms: vi.fn(),
    getPlatform: vi.fn(),
  };
  requireSessionMock.mockResolvedValue({ supabase: {}, userId: "user-1" });
});

describe("GET /api/platforms/:id", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });

    const response = await GET(new Request("http://localhost"), routeParams());
    expect(response.status).toBe(401);
  });

  it("returns 404 when the platform doesn't exist", async () => {
    fakeRepository.getPlatform = vi.fn().mockResolvedValue(null);

    const response = await GET(new Request("http://localhost"), routeParams());
    expect(response.status).toBe(404);
  });

  it("returns the platform's closure instructions and bereavement contacts", async () => {
    const platform = makePlatform();
    fakeRepository.getPlatform = vi.fn().mockResolvedValue(platform);

    const response = await GET(new Request("http://localhost"), routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.platform).toEqual(platform);
    expect(fakeRepository.getPlatform).toHaveBeenCalledWith("provider-1");
  });
});
