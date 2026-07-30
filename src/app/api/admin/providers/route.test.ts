import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminProvider, AdminProviderRepository } from "@/domain/admin-providers/ports";
import { GET, POST } from "./route";

const requirePlatformAdminMock = vi.fn();
vi.mock("@/app/api/_lib/require-platform-admin", () => ({
  requirePlatformAdmin: () => requirePlatformAdminMock(),
}));

function createFakeRepository(overrides: Partial<AdminProviderRepository> = {}): AdminProviderRepository {
  return {
    createProvider: vi.fn(),
    listProviders: vi.fn(),
    updateProvider: vi.fn(),
    ...overrides,
  };
}

let fakeRepository: AdminProviderRepository;
vi.mock("@/infrastructure/admin-providers/supabase-admin-provider-repository", () => ({
  SupabaseAdminProviderRepository: vi.fn().mockImplementation(function SupabaseAdminProviderRepository() {
    return fakeRepository;
  }),
}));

function makeProvider(overrides: Partial<AdminProvider> = {}): AdminProvider {
  return {
    id: "provider-1",
    name: "Chase",
    defaultCategory: "financial",
    websiteUrl: null,
    notes: null,
    closureMethod: null,
    closureInstructions: null,
    bereavementContactEmail: null,
    bereavementContactPhone: null,
    bereavementInstructionsUrl: null,
    logoUrl: null,
    isCommonOnboardingPlatform: false,
    supportsMemorialize: false,
    isActive: true,
    ...overrides,
  };
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/providers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeRepository = createFakeRepository();
  requirePlatformAdminMock.mockResolvedValue({ supabase: {}, userId: "admin-1" });
});

describe("GET /api/admin/providers", () => {
  it("returns 403 when the caller is not a platform admin", async () => {
    requirePlatformAdminMock.mockResolvedValue({
      unauthorized: NextResponse.json({ error: "nope" }, { status: 403 }),
    });

    const response = await GET();
    expect(response.status).toBe(403);
  });

  it("lists providers", async () => {
    const providers = [makeProvider()];
    fakeRepository.listProviders = vi.fn().mockResolvedValue(providers);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.providers).toEqual(providers);
  });
});

describe("POST /api/admin/providers", () => {
  it("returns 403 when the caller is not a platform admin", async () => {
    requirePlatformAdminMock.mockResolvedValue({
      unauthorized: NextResponse.json({ error: "nope" }, { status: 403 }),
    });

    const response = await POST(postRequest({ name: "Chase", defaultCategory: "financial" }));
    expect(response.status).toBe(403);
    expect(fakeRepository.createProvider).not.toHaveBeenCalled();
  });

  it("returns 400 when name or defaultCategory is missing", async () => {
    const response = await POST(postRequest({ name: "Chase" }));
    expect(response.status).toBe(400);
  });

  it("returns 400 (via the real service validation) for an invalid defaultCategory", async () => {
    const response = await POST(postRequest({ name: "Chase", defaultCategory: "not-a-category" }));
    expect(response.status).toBe(400);
    expect(fakeRepository.createProvider).not.toHaveBeenCalled();
  });

  it("creates the provider and returns 201", async () => {
    const provider = makeProvider();
    fakeRepository.createProvider = vi.fn().mockResolvedValue(provider);

    const response = await POST(postRequest({ name: "Chase", defaultCategory: "financial" }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.provider).toEqual(provider);
  });
});
