import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminJurisdiction, AdminJurisdictionRepository } from "@/domain/admin-jurisdictions/ports";
import { PATCH } from "./route";

const requirePlatformAdminMock = vi.fn();
vi.mock("@/app/api/_lib/require-platform-admin", () => ({
  requirePlatformAdmin: () => requirePlatformAdminMock(),
}));

function createFakeRepository(overrides: Partial<AdminJurisdictionRepository> = {}): AdminJurisdictionRepository {
  return {
    createJurisdiction: vi.fn(),
    listJurisdictions: vi.fn(),
    updateJurisdiction: vi.fn(),
    ...overrides,
  };
}

let fakeRepository: AdminJurisdictionRepository;
vi.mock("@/infrastructure/admin-jurisdictions/supabase-admin-jurisdiction-repository", () => ({
  SupabaseAdminJurisdictionRepository: vi.fn().mockImplementation(function SupabaseAdminJurisdictionRepository() {
    return fakeRepository;
  }),
}));

function makeJurisdiction(overrides: Partial<AdminJurisdiction> = {}): AdminJurisdiction {
  return {
    id: "jurisdiction-1",
    countryCode: "US",
    regionCode: "CA",
    displayName: "California, United States",
    isSupported: true,
    ...overrides,
  };
}

function routeParams(id = "jurisdiction-1") {
  return { params: Promise.resolve({ id }) };
}

function patchRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/jurisdictions/jurisdiction-1", {
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

describe("PATCH /api/admin/jurisdictions/:id", () => {
  it("returns 403 when the caller is not a platform admin", async () => {
    requirePlatformAdminMock.mockResolvedValue({
      unauthorized: NextResponse.json({ error: "nope" }, { status: 403 }),
    });

    const response = await PATCH(patchRequest({ isSupported: true }), routeParams());
    expect(response.status).toBe(403);
    expect(fakeRepository.updateJurisdiction).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid JSON body", async () => {
    const response = await PATCH(patchRequest("not json"), routeParams());
    expect(response.status).toBe(400);
  });

  it("updates the jurisdiction and returns 200", async () => {
    const updated = makeJurisdiction({ isSupported: true });
    fakeRepository.updateJurisdiction = vi.fn().mockResolvedValue(updated);

    const response = await PATCH(patchRequest({ isSupported: true }), routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.jurisdiction).toEqual(updated);
    expect(fakeRepository.updateJurisdiction).toHaveBeenCalledWith("jurisdiction-1", {
      displayName: undefined,
      isSupported: true,
    });
  });
});
