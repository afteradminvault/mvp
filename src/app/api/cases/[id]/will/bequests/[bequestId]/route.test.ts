import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EstateRepository } from "@/domain/estates/ports";
import type { WillExecutionRequirementRepository } from "@/domain/admin-will-execution-requirements/ports";
import type { DigitalAssetRepository } from "@/domain/assets/ports";
import type { BeneficiaryRepository } from "@/domain/beneficiaries/ports";
import type { DocumentRepository } from "@/domain/documents/ports";
import type { WillBequest, WillRepository } from "@/domain/wills/ports";
import { DELETE, PATCH } from "./route";

const requireSessionMock = vi.fn();
vi.mock("@/app/api/_lib/require-session", () => ({ requireSession: () => requireSessionMock() }));

let fakeWillRepository: WillRepository;
vi.mock("@/infrastructure/wills/supabase-will-repository", () => ({
  SupabaseWillRepository: vi.fn().mockImplementation(function SupabaseWillRepository() {
    return fakeWillRepository;
  }),
}));
vi.mock("@/infrastructure/estates/supabase-estate-repository", () => ({
  SupabaseEstateRepository: vi.fn().mockImplementation(function SupabaseEstateRepository() {
    return {} as EstateRepository;
  }),
}));
vi.mock("@/infrastructure/admin-will-execution-requirements/supabase-admin-will-execution-requirement-repository", () => ({
  SupabaseAdminWillExecutionRequirementRepository: vi
    .fn()
    .mockImplementation(function SupabaseAdminWillExecutionRequirementRepository() {
      return {} as WillExecutionRequirementRepository;
    }),
}));
vi.mock("@/infrastructure/assets/supabase-asset-repository", () => ({
  SupabaseDigitalAssetRepository: vi.fn().mockImplementation(function SupabaseDigitalAssetRepository() {
    return {} as DigitalAssetRepository;
  }),
}));
vi.mock("@/infrastructure/beneficiaries/supabase-beneficiary-repository", () => ({
  SupabaseBeneficiaryRepository: vi.fn().mockImplementation(function SupabaseBeneficiaryRepository() {
    return {} as BeneficiaryRepository;
  }),
}));
vi.mock("@/infrastructure/documents/supabase-document-repository", () => ({
  SupabaseDocumentRepository: vi.fn().mockImplementation(function SupabaseDocumentRepository() {
    return {} as DocumentRepository;
  }),
}));

function makeBequest(overrides: Partial<WillBequest> = {}): WillBequest {
  return {
    id: "bequest-1",
    willId: "will-1",
    bequestCategory: "vehicle",
    digitalAssetId: null,
    beneficiaryId: null,
    description: "My 2020 Honda Civic",
    displayOrder: 0,
    createdAt: "2026-08-05T00:00:00.000Z",
    updatedAt: "2026-08-05T00:00:00.000Z",
    ...overrides,
  };
}

function routeParams(id = "case-1", bequestId = "bequest-1") {
  return { params: Promise.resolve({ id, bequestId }) };
}

function patchRequest(body: unknown): Request {
  return new Request("http://localhost/api/cases/case-1/will/bequests/bequest-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeWillRepository = {
    getWillByCaseId: vi.fn(),
    createWill: vi.fn(),
    getWill: vi.fn(),
    updateGuardianInfo: vi.fn(),
    updateResiduaryClause: vi.fn(),
    listBequests: vi.fn(),
    createBequest: vi.fn(),
    updateBequest: vi.fn().mockResolvedValue(makeBequest({ description: "My 2021 Honda Civic" })),
    deleteBequest: vi.fn().mockResolvedValue(undefined),
    createVersion: vi.fn(),
    setStatus: vi.fn(),
    listExecutors: vi.fn(),
  };
  requireSessionMock.mockResolvedValue({ supabase: {}, userId: "user-1" });
});

describe("PATCH /api/cases/:id/will/bequests/:bequestId", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });

    const response = await PATCH(patchRequest({ description: "x" }), routeParams());
    expect(response.status).toBe(401);
    expect(fakeWillRepository.updateBequest).not.toHaveBeenCalled();
  });

  it("updates the bequest and returns 200", async () => {
    const response = await PATCH(patchRequest({ description: "My 2021 Honda Civic" }), routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.bequest.description).toBe("My 2021 Honda Civic");
    expect(fakeWillRepository.updateBequest).toHaveBeenCalledWith("bequest-1", expect.objectContaining({ description: "My 2021 Honda Civic" }));
  });
});

describe("DELETE /api/cases/:id/will/bequests/:bequestId", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });

    const response = await DELETE(new Request("http://localhost", { method: "DELETE" }), routeParams());
    expect(response.status).toBe(401);
    expect(fakeWillRepository.deleteBequest).not.toHaveBeenCalled();
  });

  it("deletes the bequest and returns ok", async () => {
    const response = await DELETE(new Request("http://localhost", { method: "DELETE" }), routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(fakeWillRepository.deleteBequest).toHaveBeenCalledWith("bequest-1");
  });
});
