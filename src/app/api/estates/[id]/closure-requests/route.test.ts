import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClosureRequestRepository } from "@/domain/closure-requests/ports";
import type { DigitalAssetRepository } from "@/domain/assets/ports";
import type { EstateRepository } from "@/domain/estates/ports";
import type { LegalRequirementRepository } from "@/domain/admin-legal-requirements/ports";
import { GET } from "./route";

const requireSessionMock = vi.fn();
vi.mock("@/app/api/_lib/require-session", () => ({
  requireSession: () => requireSessionMock(),
}));

let fakeClosureRequestRepository: ClosureRequestRepository;
vi.mock("@/infrastructure/closure-requests/supabase-closure-request-repository", () => ({
  SupabaseClosureRequestRepository: vi.fn().mockImplementation(function SupabaseClosureRequestRepository() {
    return fakeClosureRequestRepository;
  }),
}));

vi.mock("@/infrastructure/assets/supabase-asset-repository", () => ({
  SupabaseDigitalAssetRepository: vi.fn().mockImplementation(function SupabaseDigitalAssetRepository() {
    return {} as DigitalAssetRepository;
  }),
}));
vi.mock("@/infrastructure/estates/supabase-estate-repository", () => ({
  SupabaseEstateRepository: vi.fn().mockImplementation(function SupabaseEstateRepository() {
    return {} as EstateRepository;
  }),
}));
vi.mock("@/infrastructure/admin-legal-requirements/supabase-admin-legal-requirement-repository", () => ({
  SupabaseAdminLegalRequirementRepository: vi
    .fn()
    .mockImplementation(function SupabaseAdminLegalRequirementRepository() {
      return {} as LegalRequirementRepository;
    }),
}));

function routeParams(id = "estate-1") {
  return { params: Promise.resolve({ id }) };
}

function getRequest(query = ""): Request {
  return new Request(`http://localhost/api/estates/estate-1/closure-requests${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeClosureRequestRepository = {
    createClosureRequest: vi.fn(),
    getClosureRequest: vi.fn(),
    listClosureRequests: vi.fn().mockResolvedValue([]),
    updateClosureRequest: vi.fn(),
    getDocumentEstateId: vi.fn(),
    attachDocument: vi.fn(),
    markStaleRequestsNeedingNudge: vi.fn(),
  };
  requireSessionMock.mockResolvedValue({ supabase: {}, userId: "user-1" });
});

describe("GET /api/estates/:id/closure-requests", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });
    const response = await GET(getRequest(), routeParams());
    expect(response.status).toBe(401);
  });

  it("returns 400 for an invalid status filter", async () => {
    const response = await GET(getRequest("?status=not-a-real-status"), routeParams());
    expect(response.status).toBe(400);
  });

  it("lists closure requests, passing status/category filters through", async () => {
    const response = await GET(getRequest("?status=submitted&category=financial"), routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.closureRequests).toEqual([]);
    expect(fakeClosureRequestRepository.listClosureRequests).toHaveBeenCalledWith("estate-1", {
      status: "submitted",
      category: "financial",
    });
  });
});
