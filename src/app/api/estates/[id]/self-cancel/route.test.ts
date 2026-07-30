import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Estate } from "@/domain/estates/ports";
import type { DeathVerificationRepository } from "@/domain/death-verification/ports";
import { POST } from "./route";

const requireSessionMock = vi.fn();
vi.mock("@/app/api/_lib/require-session", () => ({
  requireSession: () => requireSessionMock(),
}));

function makeEstate(overrides: Partial<Estate> = {}): Estate {
  return {
    id: "estate-1",
    ownerUserId: "owner-1",
    jurisdictionId: "jurisdiction-1",
    displayName: "Diane's Estate",
    status: "active_living",
    checkInIntervalDays: 90,
    lastCheckInAt: "2026-07-22T00:00:00.000Z",
    gracePeriodDays: 14,
    verificationStartedAt: null,
    selfCancelWindowDays: 7,
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-22T00:00:00.000Z",
    closedAt: null,
    deceasedFullName: null,
    deceasedDateOfBirth: null,
    deceasedRelationship: null,
    deceasedDateOfDeath: null,
    draftStep: null,
    draftPayload: {},
    isSelfPlanned: false,
    ...overrides,
  };
}

let fakeRepository: DeathVerificationRepository;
vi.mock("@/infrastructure/death-verification/supabase-death-verification-repository", () => ({
  SupabaseDeathVerificationRepository: vi.fn().mockImplementation(function SupabaseDeathVerificationRepository() {
    return fakeRepository;
  }),
}));

function routeParams(id = "estate-1") {
  return { params: Promise.resolve({ id }) };
}

function postRequest(): Request {
  return new Request("http://localhost/api/estates/estate-1/self-cancel", { method: "POST" });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeRepository = {
    reportDeath: vi.fn(),
    selfCancel: vi.fn().mockResolvedValue(makeEstate()),
    getOwnerEmail: vi.fn(),
  };
  requireSessionMock.mockResolvedValue({ supabase: {}, userId: "owner-1" });
});

describe("POST /api/estates/:id/self-cancel", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });

    const response = await POST(postRequest(), routeParams());
    expect(response.status).toBe(401);
    expect(fakeRepository.selfCancel).not.toHaveBeenCalled();
  });

  it("returns 409 when self-cancel isn't currently valid (not the owner, or not verifying)", async () => {
    fakeRepository.selfCancel = vi
      .fn()
      .mockRejectedValue(new Error("self-cancel is only available to the estate owner while status is verifying"));

    const response = await POST(postRequest(), routeParams());
    expect(response.status).toBe(409);
  });

  it("reverts the estate to active_living and returns 200", async () => {
    const response = await POST(postRequest(), routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.estate.status).toBe("active_living");
    expect(fakeRepository.selfCancel).toHaveBeenCalledWith("estate-1");
  });
});
