import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClosureRequestRepository, AccountClosureRequest } from "@/domain/closure-requests/ports";
import type { DigitalAsset, DigitalAssetRepository } from "@/domain/assets/ports";
import type { Estate, EstateRepository } from "@/domain/estates/ports";
import type { LegalRequirementRepository } from "@/domain/admin-legal-requirements/ports";
import { POST } from "./route";

const requireSessionMock = vi.fn();
vi.mock("@/app/api/_lib/require-session", () => ({
  requireSession: () => requireSessionMock(),
}));

const writeAuditLogMock = vi.fn();
vi.mock("@/app/api/_lib/audit-log", () => ({
  writeAuditLog: (...args: unknown[]) => writeAuditLogMock(...args),
}));

function makeClosureRequest(overrides: Partial<AccountClosureRequest> = {}): AccountClosureRequest {
  return {
    id: "request-1",
    digitalAssetId: "asset-1",
    estateId: "estate-1",
    status: "not_started",
    assignedToUserId: null,
    legalRequirementSnapshot: [],
    lastStatusChangeAt: "2026-07-25T00:00:00.000Z",
    resolvedAt: null,
    createdAt: "2026-07-25T00:00:00.000Z",
    updatedAt: "2026-07-25T00:00:00.000Z",
    ...overrides,
  };
}

function makeAsset(overrides: Partial<DigitalAsset> = {}): DigitalAsset {
  return {
    id: "asset-1",
    estateId: "estate-1",
    category: "financial",
    providerId: null,
    customProviderName: "Chase",
    accountIdentifier: null,
    intendedOutcome: "close",
    intendedOutcomeNotes: null,
    estimatedValueCents: null,
    currency: null,
    createdAt: "2026-07-25T00:00:00.000Z",
    updatedAt: "2026-07-25T00:00:00.000Z",
    archivedAt: null,
    ...overrides,
  };
}

function makeEstate(overrides: Partial<Estate> = {}): Estate {
  return {
    id: "estate-1",
    ownerUserId: "owner-1",
    jurisdictionId: "jurisdiction-1",
    displayName: "Diane's Estate",
    status: "active_executor",
    checkInIntervalDays: 90,
    lastCheckInAt: "2026-07-25T00:00:00.000Z",
    gracePeriodDays: 14,
    verificationStartedAt: null,
    selfCancelWindowDays: 7,
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-25T00:00:00.000Z",
    closedAt: null,
    deceasedFullName: null,
    deceasedDateOfBirth: null,
    deceasedRelationship: null,
    deceasedDateOfDeath: null,
    draftStep: null,
    draftPayload: {},
    ...overrides,
  };
}

let fakeClosureRequestRepository: ClosureRequestRepository;
vi.mock("@/infrastructure/closure-requests/supabase-closure-request-repository", () => ({
  SupabaseClosureRequestRepository: vi.fn().mockImplementation(function SupabaseClosureRequestRepository() {
    return fakeClosureRequestRepository;
  }),
}));

let fakeAssetRepository: DigitalAssetRepository;
vi.mock("@/infrastructure/assets/supabase-asset-repository", () => ({
  SupabaseDigitalAssetRepository: vi.fn().mockImplementation(function SupabaseDigitalAssetRepository() {
    return fakeAssetRepository;
  }),
}));

let fakeEstateRepository: EstateRepository;
vi.mock("@/infrastructure/estates/supabase-estate-repository", () => ({
  SupabaseEstateRepository: vi.fn().mockImplementation(function SupabaseEstateRepository() {
    return fakeEstateRepository;
  }),
}));

vi.mock("@/infrastructure/admin-legal-requirements/supabase-admin-legal-requirement-repository", () => ({
  SupabaseAdminLegalRequirementRepository: vi
    .fn()
    .mockImplementation(function SupabaseAdminLegalRequirementRepository() {
      return { listRequirements: vi.fn().mockResolvedValue([]) } as unknown as LegalRequirementRepository;
    }),
}));

function routeParams(id = "estate-1", assetId = "asset-1") {
  return { params: Promise.resolve({ id, assetId }) };
}

function postRequest(): Request {
  return new Request("http://localhost/api/estates/estate-1/assets/asset-1/closure-requests", { method: "POST" });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeClosureRequestRepository = {
    createClosureRequest: vi.fn().mockResolvedValue(makeClosureRequest()),
    getClosureRequest: vi.fn(),
    listClosureRequests: vi.fn(),
    updateClosureRequest: vi.fn(),
    getDocumentEstateId: vi.fn(),
    attachDocument: vi.fn(),
    markStaleRequestsNeedingNudge: vi.fn(),
  };
  fakeAssetRepository = {
    createAsset: vi.fn(),
    getAsset: vi.fn().mockResolvedValue(makeAsset()),
    updateAsset: vi.fn(),
    archiveAsset: vi.fn(),
    listAssets: vi.fn(),
  };
  fakeEstateRepository = {
    createEstate: vi.fn(),
    getEstate: vi.fn().mockResolvedValue(makeEstate()),
    updateEstate: vi.fn(),
    recordCheckIn: vi.fn(),
    listMyEstates: vi.fn(),
    listSupportedJurisdictions: vi.fn(),
    createDraftCase: vi.fn(),
    saveDraftProgress: vi.fn(),
    activateDraftCase: vi.fn(),
  };
  requireSessionMock.mockResolvedValue({ supabase: {}, userId: "executor-1" });
});

describe("POST /api/estates/:id/assets/:assetId/closure-requests", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });
    const response = await POST(postRequest(), routeParams());
    expect(response.status).toBe(401);
    expect(fakeClosureRequestRepository.createClosureRequest).not.toHaveBeenCalled();
  });

  it("returns 404 when the asset doesn't belong to this estate", async () => {
    fakeAssetRepository.getAsset = vi.fn().mockResolvedValue(makeAsset({ estateId: "other-estate" }));
    const response = await POST(postRequest(), routeParams());
    expect(response.status).toBe(404);
  });

  it("returns 403 when the caller isn't an accepted executor (RLS denial)", async () => {
    fakeClosureRequestRepository.createClosureRequest = vi
      .fn()
      .mockRejectedValue(new Error('new row violates row-level security policy for table "account_closure_requests"'));
    const response = await POST(postRequest(), routeParams());
    expect(response.status).toBe(403);
  });

  it("creates the closure request, logs it, and returns 201", async () => {
    const response = await POST(postRequest(), routeParams());
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.closureRequest).toEqual(makeClosureRequest());
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "closure_request_created", targetId: "request-1" }),
    );
  });
});
