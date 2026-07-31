import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Estate, EstateRepository } from "@/domain/estates/ports";
import { POST } from "./route";

const requireSessionMock = vi.fn();
vi.mock("@/app/api/_lib/require-session", () => ({
  requireSession: () => requireSessionMock(),
}));

vi.mock("@/config/get-brand-config", () => ({
  getBrandConfig: vi.fn().mockResolvedValue({ brandId: "aftervault" }),
}));

function createFakeRepository(overrides: Partial<EstateRepository> = {}): EstateRepository {
  return {
    createEstate: vi.fn(),
    getEstate: vi.fn(),
    updateEstate: vi.fn(),
    recordCheckIn: vi.fn(),
    listMyEstates: vi.fn(),
    listSupportedJurisdictions: vi.fn(),
    createDraftCase: vi.fn(),
    saveDraftProgress: vi.fn(),
    activateDraftCase: vi.fn(),
    ...overrides,
  };
}

let fakeRepository: EstateRepository;
vi.mock("@/infrastructure/estates/supabase-estate-repository", () => ({
  SupabaseEstateRepository: vi.fn().mockImplementation(function SupabaseEstateRepository() {
    return fakeRepository;
  }),
}));

function makeEstate(overrides: Partial<Estate> = {}): Estate {
  return {
    id: "estate-1",
    ownerUserId: "user-1",
    jurisdictionId: "jurisdiction-1",
    displayName: "Diane Whitfield's Case",
    status: "draft",
    checkInIntervalDays: 90,
    lastCheckInAt: "2026-07-30T00:00:00.000Z",
    gracePeriodDays: 14,
    verificationStartedAt: null,
    selfCancelWindowDays: 7,
    createdAt: "2026-07-30T00:00:00.000Z",
    updatedAt: "2026-07-30T00:00:00.000Z",
    closedAt: null,
    deceasedFullName: "Diane Whitfield",
    deceasedDateOfBirth: "1950-01-01",
    deceasedRelationship: "mother",
    deceasedDateOfDeath: null,
    draftStep: null,
    draftPayload: {},
    isSelfPlanned: false,
    acquisitionBrand: "unknown",
    ...overrides,
  };
}

const validBody = {
  jurisdictionId: "jurisdiction-1",
  deceasedFullName: "Diane Whitfield",
  deceasedDateOfBirth: "1950-01-01",
  deceasedRelationship: "mother",
};

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/cases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeRepository = createFakeRepository();
  requireSessionMock.mockResolvedValue({ supabase: {}, userId: "user-1" });
});

describe("POST /api/cases", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });

    const response = await POST(postRequest(validBody));
    expect(response.status).toBe(401);
    expect(fakeRepository.createDraftCase).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid JSON body", async () => {
    const response = await POST(postRequest("not json"));
    expect(response.status).toBe(400);
  });

  it.each(["jurisdictionId", "deceasedFullName", "deceasedDateOfBirth", "deceasedRelationship"])(
    "returns 400 when %s is missing",
    async (field) => {
      const rest: Record<string, unknown> = { ...validBody };
      delete rest[field];
      const response = await POST(postRequest(rest));
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toMatch(new RegExp(field));
    },
  );

  it("returns 400 when deceasedDateOfDeath is provided but not a string", async () => {
    const response = await POST(postRequest({ ...validBody, deceasedDateOfDeath: 12345 }));
    expect(response.status).toBe(400);
  });

  it("returns 400 (via the real EstateService validation) for an invalid date of birth", async () => {
    const response = await POST(postRequest({ ...validBody, deceasedDateOfBirth: "not-a-date" }));
    expect(response.status).toBe(400);
    expect(fakeRepository.createDraftCase).not.toHaveBeenCalled();
  });

  it("creates a draft case and returns 201 on valid input", async () => {
    const created = makeEstate();
    fakeRepository.createDraftCase = vi.fn().mockResolvedValue(created);

    const response = await POST(postRequest(validBody));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.case).toEqual(created);
    expect(fakeRepository.createDraftCase).toHaveBeenCalledWith({
      jurisdictionId: "jurisdiction-1",
      deceasedFullName: "Diane Whitfield",
      deceasedDateOfBirth: "1950-01-01",
      deceasedRelationship: "mother",
      deceasedDateOfDeath: null,
      checkInIntervalDays: undefined,
      isSelfPlanned: false,
      acquisitionBrand: "aftervault",
    });
  });

  it("passes through an explicit deceasedDateOfDeath", async () => {
    const created = makeEstate({ deceasedDateOfDeath: "2026-07-01" });
    fakeRepository.createDraftCase = vi.fn().mockResolvedValue(created);

    const response = await POST(postRequest({ ...validBody, deceasedDateOfDeath: "2026-07-01" }));

    expect(response.status).toBe(201);
    expect(fakeRepository.createDraftCase).toHaveBeenCalledWith(
      expect.objectContaining({ deceasedDateOfDeath: "2026-07-01" }),
    );
  });

  it("passes through isSelfPlanned=true (Will Builder /wills/new entry point)", async () => {
    const created = makeEstate({ isSelfPlanned: true });
    fakeRepository.createDraftCase = vi.fn().mockResolvedValue(created);

    const response = await POST(postRequest({ ...validBody, isSelfPlanned: true }));

    expect(response.status).toBe(201);
    expect(fakeRepository.createDraftCase).toHaveBeenCalledWith(expect.objectContaining({ isSelfPlanned: true }));
  });

  it("returns 400 when isSelfPlanned is provided but not a boolean", async () => {
    const response = await POST(postRequest({ ...validBody, isSelfPlanned: "yes" }));
    expect(response.status).toBe(400);
    expect(fakeRepository.createDraftCase).not.toHaveBeenCalled();
  });
});
