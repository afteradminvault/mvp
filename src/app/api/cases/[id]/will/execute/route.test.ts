import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Estate, EstateRepository } from "@/domain/estates/ports";
import type { WillExecutionRequirementRepository } from "@/domain/admin-will-execution-requirements/ports";
import type { DigitalAssetRepository } from "@/domain/assets/ports";
import type { BeneficiaryRepository } from "@/domain/beneficiaries/ports";
import type { DocumentRepository } from "@/domain/documents/ports";
import type { Will, WillRepository } from "@/domain/wills/ports";
import { POST } from "./route";

const requireSessionMock = vi.fn();
vi.mock("@/app/api/_lib/require-session", () => ({ requireSession: () => requireSessionMock() }));
const writeAuditLogMock = vi.fn();
vi.mock("@/app/api/_lib/audit-log", () => ({ writeAuditLog: (...args: unknown[]) => writeAuditLogMock(...args) }));

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
    status: "ready_to_sign",
    guardianFullName: null,
    guardianRelationship: null,
    alternateGuardianFullName: null,
    alternateGuardianRelationship: null,
    hasMinorChildren: false,
    residuaryBeneficiaryDescription: null,
    currentVersionId: "version-1",
    executedAt: null,
    createdAt: "2026-08-05T00:00:00.000Z",
    updatedAt: "2026-08-05T00:00:00.000Z",
    ...overrides,
  };
}

function routeParams(id = "case-1") {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeWillRepository = {
    getWillByCaseId: vi.fn().mockResolvedValue(makeWill()),
    createWill: vi.fn(),
    getWill: vi.fn().mockResolvedValue(makeWill()),
    updateGuardianInfo: vi.fn(),
    updateResiduaryClause: vi.fn(),
    listBequests: vi.fn(),
    createBequest: vi.fn(),
    updateBequest: vi.fn(),
    deleteBequest: vi.fn(),
    createVersion: vi.fn(),
    setStatus: vi.fn().mockResolvedValue(makeWill({ status: "executed", executedAt: "2026-08-05T01:00:00.000Z" })),
    listExecutors: vi.fn(),
  };
  fakeEstateRepository = { getEstate: vi.fn().mockResolvedValue(makeEstate()) } as unknown as EstateRepository;
  requireSessionMock.mockResolvedValue({ supabase: {}, userId: "user-1" });
});

describe("POST /api/cases/:id/will/execute", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });

    const response = await POST(new Request("http://localhost", { method: "POST" }), routeParams());
    expect(response.status).toBe(401);
    expect(fakeWillRepository.setStatus).not.toHaveBeenCalled();
  });

  it("returns 409 when the will isn't ready_to_sign", async () => {
    fakeWillRepository.getWill = vi.fn().mockResolvedValue(makeWill({ status: "draft" }));

    const response = await POST(new Request("http://localhost", { method: "POST" }), routeParams());
    expect(response.status).toBe(409);
  });

  it("marks the will executed, writes an audit log, and returns 200", async () => {
    const response = await POST(new Request("http://localhost", { method: "POST" }), routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.will.status).toBe("executed");
    expect(writeAuditLogMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ eventType: "will_executed" }));
  });
});
