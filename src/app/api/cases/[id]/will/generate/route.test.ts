import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Estate, EstateRepository } from "@/domain/estates/ports";
import type { WillExecutionRequirement, WillExecutionRequirementRepository } from "@/domain/admin-will-execution-requirements/ports";
import type { DigitalAssetRepository } from "@/domain/assets/ports";
import type { BeneficiaryRepository } from "@/domain/beneficiaries/ports";
import type { Document, DocumentRepository } from "@/domain/documents/ports";
import type { Will, WillRepository, WillVersion } from "@/domain/wills/ports";
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

function makeExecutionRequirement(overrides: Partial<WillExecutionRequirement> = {}): WillExecutionRequirement {
  return {
    id: "req-1",
    jurisdictionId: "jurisdiction-1",
    witnessCount: 2,
    notarizationRequired: false,
    selfProvingAffidavitAvailable: false,
    holographicWillsAllowed: false,
    executionInstructions: "Sign in front of two witnesses.",
    effectiveDate: "2026-08-05",
    supersededById: null,
    notes: null,
    pendingCounselReview: true,
    createdAt: "2026-08-05T00:00:00.000Z",
    updatedAt: "2026-08-05T00:00:00.000Z",
    ...overrides,
  };
}

function makeDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: "doc-1",
    estateId: "case-1",
    uploadedByUserId: "user-1",
    documentType: "will",
    storagePath: "case-1/doc-1",
    fileName: "will-Marcus Whitfield.pdf",
    mimeType: "application/pdf",
    fileSizeBytes: 100,
    isCertifiedOriginal: false,
    notes: null,
    uploadedAt: "2026-08-05T00:00:00.000Z",
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
    listBequests: vi.fn().mockResolvedValue([]),
    createBequest: vi.fn(),
    updateBequest: vi.fn(),
    deleteBequest: vi.fn(),
    createVersion: vi.fn().mockResolvedValue({ id: "version-1", willId: "will-1", content: "content", generatedAt: "2026-08-05T00:00:00.000Z" } satisfies WillVersion),
    setStatus: vi.fn().mockResolvedValue(makeWill({ status: "ready_to_sign", currentVersionId: "version-1" })),
    listExecutors: vi.fn().mockResolvedValue([]),
  };
  fakeEstateRepository = { getEstate: vi.fn().mockResolvedValue(makeEstate()) } as unknown as EstateRepository;
  fakeExecutionRequirementRepository = {
    listRequirements: vi.fn().mockResolvedValue([makeExecutionRequirement()]),
  } as unknown as WillExecutionRequirementRepository;
  fakeDigitalAssetRepository = { getAsset: vi.fn() } as unknown as DigitalAssetRepository;
  fakeBeneficiaryRepository = { getBeneficiary: vi.fn() } as unknown as BeneficiaryRepository;
  fakeDocumentRepository = { uploadDocument: vi.fn().mockResolvedValue(makeDocument()) } as unknown as DocumentRepository;
  requireSessionMock.mockResolvedValue({ supabase: {}, userId: "user-1" });
});

describe("POST /api/cases/:id/will/generate", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });

    const response = await POST(new Request("http://localhost", { method: "POST" }), routeParams());
    expect(response.status).toBe(401);
    expect(fakeWillRepository.createVersion).not.toHaveBeenCalled();
  });

  it("returns 400 when no execution requirements exist for the jurisdiction", async () => {
    fakeExecutionRequirementRepository.listRequirements = vi.fn().mockResolvedValue([]);

    const response = await POST(new Request("http://localhost", { method: "POST" }), routeParams());
    expect(response.status).toBe(400);
  });

  it("generates the document, writes an audit log, and returns 200", async () => {
    const response = await POST(new Request("http://localhost", { method: "POST" }), routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.will.status).toBe("ready_to_sign");
    expect(fakeDocumentRepository.uploadDocument).toHaveBeenCalled();
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "will_generated" }),
    );
  });
});
