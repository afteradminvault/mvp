import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminProvider, AdminProviderRepository } from "@/domain/admin-providers/ports";
import { PATCH } from "./route";

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

function routeParams(id = "provider-1") {
  return { params: Promise.resolve({ id }) };
}

function patchRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/providers/provider-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeRepository = createFakeRepository();
  requirePlatformAdminMock.mockResolvedValue({ supabase: {}, userId: "admin-1" });
});

describe("PATCH /api/admin/providers/:id", () => {
  it("returns 403 when the caller is not a platform admin", async () => {
    requirePlatformAdminMock.mockResolvedValue({
      unauthorized: NextResponse.json({ error: "nope" }, { status: 403 }),
    });

    const response = await PATCH(patchRequest({ name: "Chase Bank" }), routeParams());
    expect(response.status).toBe(403);
    expect(fakeRepository.updateProvider).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid JSON body", async () => {
    const response = await PATCH(patchRequest("not json"), routeParams());
    expect(response.status).toBe(400);
  });

  it("updates the provider and returns 200", async () => {
    const updated = makeProvider({ name: "Chase Bank" });
    fakeRepository.updateProvider = vi.fn().mockResolvedValue(updated);

    const response = await PATCH(patchRequest({ name: "Chase Bank" }), routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.provider).toEqual(updated);
  });
});
