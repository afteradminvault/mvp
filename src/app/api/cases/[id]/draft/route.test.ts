import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Estate, EstateRepository } from "@/domain/estates/ports";
import { PATCH } from "./route";

const requireSessionMock = vi.fn();
vi.mock("@/app/api/_lib/require-session", () => ({
  requireSession: () => requireSessionMock(),
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
    draftStep: "checklist",
    draftPayload: {},
    ...overrides,
  };
}

function routeParams(id = "estate-1") {
  return { params: Promise.resolve({ id }) };
}

function patchRequest(body: unknown): Request {
  return new Request("http://localhost/api/cases/estate-1/draft", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeRepository = createFakeRepository();
  requireSessionMock.mockResolvedValue({ supabase: {}, userId: "user-1" });
});

describe("PATCH /api/cases/:id/draft", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });

    const response = await PATCH(patchRequest({ draftStep: "checklist", draftPayload: {} }), routeParams());
    expect(response.status).toBe(401);
    expect(fakeRepository.saveDraftProgress).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid JSON body", async () => {
    const response = await PATCH(patchRequest("not json"), routeParams());
    expect(response.status).toBe(400);
  });

  it("returns 400 when draftStep is missing", async () => {
    const response = await PATCH(patchRequest({ draftPayload: {} }), routeParams());
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/draftStep/);
  });

  it("returns 400 when draftPayload is missing", async () => {
    const response = await PATCH(patchRequest({ draftStep: "checklist" }), routeParams());
    expect(response.status).toBe(400);
  });

  it("returns 400 when draftPayload is not an object", async () => {
    const response = await PATCH(patchRequest({ draftStep: "checklist", draftPayload: "nope" }), routeParams());
    expect(response.status).toBe(400);
  });

  it("returns 400 (via the real EstateService validation) once onboarding is no longer in draft", async () => {
    fakeRepository.getEstate = vi.fn().mockResolvedValue(makeEstate({ status: "active_living" }));

    const response = await PATCH(
      patchRequest({ draftStep: "checklist", draftPayload: { platforms: ["gmail"] } }),
      routeParams(),
    );

    expect(response.status).toBe(400);
    expect(fakeRepository.saveDraftProgress).not.toHaveBeenCalled();
  });

  it("saves progress and returns 200 on valid input", async () => {
    fakeRepository.getEstate = vi.fn().mockResolvedValue(makeEstate({ draftPayload: { profile: { done: true } } }));
    const updated = makeEstate({ draftStep: "checklist", draftPayload: { profile: { done: true }, checklist: [] } });
    fakeRepository.saveDraftProgress = vi.fn().mockResolvedValue(updated);

    const response = await PATCH(
      patchRequest({ draftStep: "checklist", draftPayload: { checklist: [] } }),
      routeParams(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.case).toEqual(updated);
    expect(fakeRepository.saveDraftProgress).toHaveBeenCalledWith("estate-1", {
      draftStep: "checklist",
      draftPayload: { profile: { done: true }, checklist: [] },
    });
  });
});
