import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Estate, EstateRepository } from "@/domain/estates/ports";
import type { WillExecutionRequirementRepository } from "@/domain/admin-will-execution-requirements/ports";
import type { DigitalAssetRepository } from "@/domain/assets/ports";
import type { BeneficiaryRepository } from "@/domain/beneficiaries/ports";
import type { DocumentRepository } from "@/domain/documents/ports";
import type { Will, WillBequest, WillRepository } from "@/domain/wills/ports";
import { POST } from "./route";

const requireSessionMock = vi.fn();
vi.mock("@/app/api/_lib/require-session", () => ({ requireSession: () => requireSessionMock() }));

let fakeWillRepository: WillRepository;
vi.mock("@/infrastructure/wills/supabase-will-repository", () => ({
  SupabaseWillRepository: vi.fn().mockImplementation(function SupabaseWillRepository() {
    return fakeWillRepository;
  }),
}));
let fakeEstateRepository: EstateRepository;
vi.mock("@/infrastructure/estates/supabase-estate-repository", () => ({
  SupabaseEstateRepository: vi.fn().mockImplementation(function SupabaseEstateRepository() {
    return fakeEstateRepository;
  }),
}));
let fakeExecutionRequirementRepository: WillExecutionRequirementRepository;
vi.mock("@/infrastructure/admin-will-execution-requirements/supabase-admin-will-execution-requirement-repository", () => ({
  SupabaseAdminWillExecutionRequirementRepository: vi
    .fn()
    .mockImplementation(function SupabaseAdminWillExecutionRequirementRepository() {
      return fakeExecutionRequirementRepository;
    }),
}));
let fakeDigitalAssetRepository: DigitalAssetRepository;
vi.mock("@/infrastructure/assets/supabase-asset-repository", () => ({
  SupabaseDigitalAssetRepository: vi.fn().mockImplementation(function SupabaseDigitalAssetRepository() {
    return fakeDigitalAssetRepository;
  }),
}));
let fakeBeneficiaryRepository: BeneficiaryRepository;
vi.mock("@/infrastructure/beneficiaries/supabase-beneficiary-repository", () => ({
  SupabaseBeneficiaryRepository: vi.fn().mockImplementation(function SupabaseBeneficiaryRepository() {
    return fakeBeneficiaryRepository;
  }),
}));
let fakeDocumentRepository: DocumentRepository;
vi.mock("@/infrastructure/documents/supabase-document-repository", () => ({
  SupabaseDocumentRepository: vi.fn().mockImplementation(function SupabaseDocumentRepository() {
    return fakeDocumentRepository;
  }),
}));

function makeEstate(overrides: Partial<Estate> = {}): Estate {
  return {
    id: "case-1",
    ownerUserId: "user-1",
    jurisdictionId: "jurisdiction-1",
    displayName: "Marcus Whitfield's Case",
    status: "active_living",
    checkInIntervalDays: 90,
    lastCheckInAt: "2026-08-05T00:00:00.000Z",
    gracePeriodDays: 14,
    verificationStartedAt: null,
    selfCancelWindowDays: 7,
    createdAt: "2026-08-05T00:00:00.000Z",
    updatedAt: "2026-08-05T00:00:00.000Z",
    closedAt: null,
    deceasedFullName: "Marcus Whitfield",
    deceasedDateOfBirth: "1980-05-01",
    deceasedRelationship: "Self",
    deceasedDateOfDeath: null,
    draftStep: null,
    draftPayload: {},
    isSelfPlanned: true,
    ...overrides,
  };
}

function makeWill(overrides: Partial<Will> = {}): Will {
  return {
    id: "will-1",
    caseId: "case-1",
    status: "draft",
    guardianFullName: null,
    guardianRelationship: null,
    alternateGuardianFullName: null,
    alternateGuardianRelationship: null,
    hasMinorChildren: false,
    residuaryBeneficiaryDescription: null,
    currentVersionId: null,
    executedAt: null,
    createdAt: "2026-08-05T00:00:00.000Z",
    updatedAt: "2026-08-05T00:00:00.000Z",
    ...overrides,
  };
}

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

function routeParams(id = "case-1") {
  return { params: Promise.resolve({ id }) };
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/cases/case-1/will/bequests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeWillRepository = {
    getWillByCaseId: vi.fn().mockResolvedValue(makeWill()),
    createWill: vi.fn(),
    getWill: vi.fn(),
    updateGuardianInfo: vi.fn(),
    updateResiduaryClause: vi.fn(),
    listBequests: vi.fn(),
    createBequest: vi.fn().mockResolvedValue(makeBequest()),
    updateBequest: vi.fn(),
    deleteBequest: vi.fn(),
    createVersion: vi.fn(),
    setStatus: vi.fn(),
    listExecutors: vi.fn(),
  };
  fakeEstateRepository = { getEstate: vi.fn().mockResolvedValue(makeEstate()) } as unknown as EstateRepository;
  fakeExecutionRequirementRepository = {} as WillExecutionRequirementRepository;
  fakeDigitalAssetRepository = {} as DigitalAssetRepository;
  fakeBeneficiaryRepository = {} as BeneficiaryRepository;
  fakeDocumentRepository = {} as DocumentRepository;
  requireSessionMock.mockResolvedValue({ supabase: {}, userId: "user-1" });
});

describe("POST /api/cases/:id/will/bequests", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });

    const response = await POST(postRequest({ bequestCategory: "vehicle", description: "x" }), routeParams());
    expect(response.status).toBe(401);
    expect(fakeWillRepository.createBequest).not.toHaveBeenCalled();
  });

  it("returns 400 (via the real service validation) when neither a link nor a description is given", async () => {
    const response = await POST(postRequest({ bequestCategory: "vehicle" }), routeParams());
    expect(response.status).toBe(400);
    expect(fakeWillRepository.createBequest).not.toHaveBeenCalled();
  });

  it("creates the bequest and returns 201", async () => {
    const response = await POST(postRequest({ bequestCategory: "vehicle", description: "My 2020 Honda Civic" }), routeParams());
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.bequest).toEqual(makeBequest());
    expect(fakeWillRepository.createBequest).toHaveBeenCalledWith(
      "will-1",
      expect.objectContaining({ bequestCategory: "vehicle", description: "My 2020 Honda Civic" }),
    );
  });
});
