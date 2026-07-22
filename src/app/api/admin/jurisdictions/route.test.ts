import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminJurisdiction, AdminJurisdictionRepository } from "@/domain/admin-jurisdictions/ports";
import { GET, POST } from "./route";

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

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/jurisdictions", {
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

describe("GET /api/admin/jurisdictions", () => {
  it("returns 403 when the caller is not a platform admin", async () => {
    requirePlatformAdminMock.mockResolvedValue({
      unauthorized: NextResponse.json({ error: "nope" }, { status: 403 }),
    });

    const response = await GET();
    expect(response.status).toBe(403);
  });

  it("lists all jurisdictions", async () => {
    const jurisdictions = [makeJurisdiction()];
    fakeRepository.listJurisdictions = vi.fn().mockResolvedValue(jurisdictions);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.jurisdictions).toEqual(jurisdictions);
  });
});

describe("POST /api/admin/jurisdictions", () => {
  it("returns 403 when the caller is not a platform admin", async () => {
    requirePlatformAdminMock.mockResolvedValue({
      unauthorized: NextResponse.json({ error: "nope" }, { status: 403 }),
    });

    const response = await POST(postRequest({ countryCode: "US", displayName: "United States" }));
    expect(response.status).toBe(403);
    expect(fakeRepository.createJurisdiction).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid JSON body", async () => {
    const response = await POST(postRequest("not json"));
    expect(response.status).toBe(400);
  });

  it("returns 400 when countryCode or displayName is missing", async () => {
    const response = await POST(postRequest({ displayName: "United States" }));
    expect(response.status).toBe(400);
  });

  it("returns 400 (via the real service validation) for an invalid country code", async () => {
    const response = await POST(postRequest({ countryCode: "USA", displayName: "United States" }));
    expect(response.status).toBe(400);
    expect(fakeRepository.createJurisdiction).not.toHaveBeenCalled();
  });

  it("creates the jurisdiction and returns 201", async () => {
    const jurisdiction = makeJurisdiction();
    fakeRepository.createJurisdiction = vi.fn().mockResolvedValue(jurisdiction);

    const response = await POST(
      postRequest({ countryCode: "US", regionCode: "CA", displayName: "California, United States" }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.jurisdiction).toEqual(jurisdiction);
  });
});
