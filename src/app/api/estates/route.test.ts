import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Estate, EstateRepository } from "@/domain/estates/ports";
import { GET, POST } from "./route";

/**
 * Route-handler-level test for POST/GET /api/estates (API Specification
 * §2): exercises the real EstateService validation logic through the
 * actual exported route functions, with only the Supabase-backed
 * repository and the session check faked — the two things that would
 * otherwise require a live Supabase project to test at this layer. RLS
 * itself is covered separately in
 * src/integration/rls-estate-isolation.integration.test.ts, and domain
 * validation rules are covered in isolation in
 * src/domain/estates/estate-service.test.ts; this file's job is the HTTP
 * wiring in between (status codes, request parsing, auth gating).
 */

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
  // A regular function, not an arrow function — `new SupabaseEstateRepository(...)`
  // in route.ts requires a constructible mock, and arrow functions can't be `new`'d.
  SupabaseEstateRepository: vi.fn().mockImplementation(function SupabaseEstateRepository() {
    return fakeRepository;
  }),
}));

function makeEstate(overrides: Partial<Estate> = {}): Estate {
  return {
    id: "estate-1",
    ownerUserId: "user-1",
    jurisdictionId: "jurisdiction-1",
    displayName: "Diane's Estate",
    status: "setup",
    checkInIntervalDays: 90,
    lastCheckInAt: "2026-07-19T00:00:00.000Z",
    gracePeriodDays: 14,
    verificationStartedAt: null,
    selfCancelWindowDays: 7,
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
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

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/estates", {
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

describe("GET /api/estates", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });

    const response = await GET();
    expect(response.status).toBe(401);
  });
  it("returns the current user's estates", async () => {
    const estates = [makeEstate()];
    fakeRepository.listMyEstates = vi.fn().mockResolvedValue(estates);

    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.estates).toEqual(estates);
  });
});

describe("POST /api/estates", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });

    const response = await POST(postRequest({ displayName: "Diane's Estate", jurisdictionId: "j1" }));
    expect(response.status).toBe(401);
    expect(fakeRepository.createEstate).not.toHaveBeenCalled();
  });
  it("returns 400 for an invalid JSON body", async () => {
    const response = await POST(postRequest("not json"));
    expect(response.status).toBe(400);
  });
  it("returns 400 when displayName is missing", async () => {
    const response = await POST(postRequest({ jurisdictionId: "j1" }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/displayName/);
  });
  it("returns 400 when jurisdictionId is missing", async () => {
    const response = await POST(postRequest({ displayName: "Diane's Estate" }));
    expect(response.status).toBe(400);
  });
  it("returns 400 when checkInIntervalDays is not a number", async () => {
    const response = await POST(
      postRequest({ displayName: "Diane's Estate", jurisdictionId: "j1", checkInIntervalDays: "90" }),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/checkInIntervalDays/);
  });
  it("returns 400 (via the real EstateService validation) for a blank display name", async () => {
    const response = await POST(postRequest({ displayName: "   ", jurisdictionId: "j1" }));
    expect(response.status).toBe(400);
    expect(fakeRepository.createEstate).not.toHaveBeenCalled();
  });
  it("returns 400 (via the real EstateService validation) for an out-of-range check-in interval", async () => {
    const response = await POST(
      postRequest({ displayName: "Diane's Estate", jurisdictionId: "j1", checkInIntervalDays: 1 }),
    );
    expect(response.status).toBe(400);
    expect(fakeRepository.createEstate).not.toHaveBeenCalled();
  });
  it("creates the estate and returns 201 on valid input, defaulting check-in interval per the RPC", async () => {
    const created = makeEstate();
    fakeRepository.createEstate = vi.fn().mockResolvedValue(created);

    const response = await POST(postRequest({ displayName: "  Diane's Estate  ", jurisdictionId: "j1" }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.estate).toEqual(created);
    expect(fakeRepository.createEstate).toHaveBeenCalledWith({
      displayName: "Diane's Estate",
      jurisdictionId: "j1",
      checkInIntervalDays: undefined,
    });
  });
  it("passes an explicit check-in interval through to the repository", async () => {
    const created = makeEstate({ checkInIntervalDays: 60 });
    fakeRepository.createEstate = vi.fn().mockResolvedValue(created);

    const response = await POST(
      postRequest({ displayName: "Diane's Estate", jurisdictionId: "j1", checkInIntervalDays: 60 }),
    );

    expect(response.status).toBe(201);
    expect(fakeRepository.createEstate).toHaveBeenCalledWith({
      displayName: "Diane's Estate",
      jurisdictionId: "j1",
      checkInIntervalDays: 60,
    });
  });
});
