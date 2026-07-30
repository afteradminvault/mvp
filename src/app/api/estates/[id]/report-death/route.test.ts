import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Estate } from "@/domain/estates/ports";
import type { DeathVerificationRepository } from "@/domain/death-verification/ports";
import { POST } from "./route";

const requireSessionMock = vi.fn();
vi.mock("@/app/api/_lib/require-session", () => ({
  requireSession: () => requireSessionMock(),
}));

const writeAuditLogMock = vi.fn();
vi.mock("@/app/api/_lib/audit-log", () => ({
  writeAuditLog: (...args: unknown[]) => writeAuditLogMock(...args),
}));

vi.mock("@/config/env", () => ({
  getServerEnv: () => ({ RESEND_API_KEY: undefined, RESEND_FROM_EMAIL: undefined }),
}));

const sendDeathVerificationNoticeEmailMock = vi.fn();
vi.mock("@/infrastructure/email/resend-email-sender", () => ({
  ResendEmailSender: vi.fn().mockImplementation(function ResendEmailSender() {
    return { sendDeathVerificationNoticeEmail: sendDeathVerificationNoticeEmailMock };
  }),
}));

function makeEstate(overrides: Partial<Estate> = {}): Estate {
  return {
    id: "estate-1",
    ownerUserId: "owner-1",
    jurisdictionId: "jurisdiction-1",
    displayName: "Diane's Estate",
    status: "verifying",
    checkInIntervalDays: 90,
    lastCheckInAt: "2026-07-22T00:00:00.000Z",
    gracePeriodDays: 14,
    verificationStartedAt: "2026-07-22T00:00:00.000Z",
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
  return new Request("http://localhost/api/estates/estate-1/report-death", { method: "POST" });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeRepository = {
    reportDeath: vi.fn().mockResolvedValue(makeEstate()),
    selfCancel: vi.fn(),
    getOwnerEmail: vi.fn().mockResolvedValue("diane@example.com"),
  };
  sendDeathVerificationNoticeEmailMock.mockResolvedValue(false);
  requireSessionMock.mockResolvedValue({ supabase: {}, userId: "executor-1" });
});

describe("POST /api/estates/:id/report-death", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });

    const response = await POST(postRequest(), routeParams());
    expect(response.status).toBe(401);
    expect(fakeRepository.reportDeath).not.toHaveBeenCalled();
  });

  it("returns 403 when the caller is not an accepted executor/helper", async () => {
    fakeRepository.reportDeath = vi
      .fn()
      .mockRejectedValue(new Error("only an accepted executor or helper may report a death for this estate"));

    const response = await POST(postRequest(), routeParams());
    expect(response.status).toBe(403);
  });

  it("returns 409 when the estate is not in a reportable state", async () => {
    fakeRepository.reportDeath = vi
      .fn()
      .mockRejectedValue(
        new Error("this estate is not in a state that can be reported (already being verified, or not yet active)"),
      );

    const response = await POST(postRequest(), routeParams());
    expect(response.status).toBe(409);
  });

  it("transitions the estate, sends the notice, logs the outcome, and returns 200", async () => {
    sendDeathVerificationNoticeEmailMock.mockResolvedValue(true);

    const response = await POST(postRequest(), routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.estate.status).toBe("verifying");
    expect(body.emailSent).toBe(true);

    expect(fakeRepository.getOwnerEmail).toHaveBeenCalledWith("estate-1");
    expect(sendDeathVerificationNoticeEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        toEmail: "diane@example.com",
        estateDisplayName: "Diane's Estate",
        selfCancelWindowDays: 7,
        selfCancelUrl: expect.stringContaining("/estates/estate-1"),
      }),
    );
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: "verification_notice_sent",
        estateId: "estate-1",
        metadata: { channel: "email", success: true },
      }),
    );
  });

  it("still returns 200 (emailSent: false) if the notice email fails", async () => {
    sendDeathVerificationNoticeEmailMock.mockResolvedValue(false);

    const response = await POST(postRequest(), routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.emailSent).toBe(false);
  });
});
