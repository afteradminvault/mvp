import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Estate, EstateRepository } from "@/domain/estates/ports";
import type { KeyRecoveryRepository } from "@/domain/key-recovery/ports";
import { GET } from "./route";

const requireSessionMock = vi.fn();
vi.mock("@/app/api/_lib/require-session", () => ({
  requireSession: () => requireSessionMock(),
}));

const writeAuditLogMock = vi.fn();
vi.mock("@/app/api/_lib/audit-log", () => ({
  writeAuditLog: (...args: unknown[]) => writeAuditLogMock(...args),
}));

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
    isSelfPlanned: false,
    acquisitionBrand: "unknown",
    ...overrides,
  };
}

let fakeEstateRepository: EstateRepository;
vi.mock("@/infrastructure/estates/supabase-estate-repository", () => ({
  SupabaseEstateRepository: vi.fn().mockImplementation(function SupabaseEstateRepository() {
    return fakeEstateRepository;
  }),
}));

let fakeKeyRecoveryRepository: KeyRecoveryRepository;
vi.mock("@/infrastructure/key-recovery/supabase-key-recovery-repository", () => ({
  SupabaseKeyRecoveryRepository: vi.fn().mockImplementation(function SupabaseKeyRecoveryRepository() {
    return fakeKeyRecoveryRepository;
  }),
}));

function routeParams(id = "estate-1") {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
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
  fakeKeyRecoveryRepository = {
    getExecutorKeyRecoveryMaterial: vi
      .fn()
      .mockResolvedValue({ wrappedVaultKey: "aabb", publicKey: "ccdd", wrappedPrivateKey: "eeff", kdfSalt: "0011" }),
  };
  requireSessionMock.mockResolvedValue({ supabase: {}, userId: "executor-1" });
});

describe("GET /api/estates/:id/key-recovery", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });
    const response = await GET(new Request("http://localhost"), routeParams());
    expect(response.status).toBe(401);
    expect(fakeKeyRecoveryRepository.getExecutorKeyRecoveryMaterial).not.toHaveBeenCalled();
  });

  it("returns 409 when the estate isn't active_executor yet", async () => {
    fakeEstateRepository.getEstate = vi.fn().mockResolvedValue(makeEstate({ status: "awaiting_death_certificate" }));
    const response = await GET(new Request("http://localhost"), routeParams());
    expect(response.status).toBe(409);
    expect(fakeKeyRecoveryRepository.getExecutorKeyRecoveryMaterial).not.toHaveBeenCalled();
  });

  it("returns 403 when the caller has no wrapped material", async () => {
    fakeKeyRecoveryRepository.getExecutorKeyRecoveryMaterial = vi.fn().mockResolvedValue(null);
    const response = await GET(new Request("http://localhost"), routeParams());
    expect(response.status).toBe(403);
  });

  it("returns the wrapped material and logs key_recovery_used", async () => {
    const response = await GET(new Request("http://localhost"), routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.keyRecovery).toEqual({
      wrappedVaultKey: "aabb",
      publicKey: "ccdd",
      wrappedPrivateKey: "eeff",
      kdfSalt: "0011",
    });
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "key_recovery_used", estateId: "estate-1", actorUserId: "executor-1" }),
    );
  });
});
