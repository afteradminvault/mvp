import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecutorVerification, ExecutorVerificationRepository } from "@/domain/executor-verification/ports";
import { POST } from "./route";

const requireSessionMock = vi.fn();
vi.mock("@/app/api/_lib/require-session", () => ({
  requireSession: () => requireSessionMock(),
}));

const writeAuditLogMock = vi.fn();
vi.mock("@/app/api/_lib/audit-log", () => ({
  writeAuditLog: (...args: unknown[]) => writeAuditLogMock(...args),
}));

function makeVerification(overrides: Partial<ExecutorVerification> = {}): ExecutorVerification {
  return {
    id: "verification-1",
    estateId: "estate-1",
    memberId: "member-1",
    status: "fully_verified",
    idDocumentStoragePath: "estate-1/executor-verification/member-1",
    legalTermsAcceptedAt: "2026-08-01T00:00:00.000Z",
    familyApprovedAt: "2026-08-01T00:00:00.000Z",
    familyApprovedByUserId: "user-1",
    familyDeclinedAt: null,
    familyDeclinedByUserId: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

let fakeRepository: ExecutorVerificationRepository;
vi.mock("@/infrastructure/executor-verification/supabase-executor-verification-repository", () => ({
  SupabaseExecutorVerificationRepository: vi.fn().mockImplementation(function SupabaseExecutorVerificationRepository() {
    return fakeRepository;
  }),
}));

function routeParams(id = "estate-1", memberId = "member-1") {
  return { params: Promise.resolve({ id, memberId }) };
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/estates/estate-1/members/member-1/verification/approve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeRepository = {
    getVerification: vi.fn(),
    uploadIdDocument: vi.fn(),
    acceptLegalTerms: vi.fn(),
    decide: vi.fn().mockResolvedValue(makeVerification()),
  };
  requireSessionMock.mockResolvedValue({ supabase: {}, userId: "user-1" });
});

describe("POST /api/estates/:id/members/:memberId/verification/approve", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });

    const response = await POST(postRequest({ approved: true }), routeParams());
    expect(response.status).toBe(401);
    expect(fakeRepository.decide).not.toHaveBeenCalled();
  });

  it("returns 400 when approved is missing", async () => {
    const response = await POST(postRequest({}), routeParams());
    expect(response.status).toBe(400);
    expect(fakeRepository.decide).not.toHaveBeenCalled();
  });

  it("returns 403 when the caller isn't a family-role member", async () => {
    fakeRepository.decide = vi
      .fn()
      .mockRejectedValue(new Error("only a family member can decide an executor verification"));

    const response = await POST(postRequest({ approved: true }), routeParams());
    expect(response.status).toBe(403);
  });

  it("approves, writes an audit log with the approved event, and returns 200", async () => {
    const response = await POST(postRequest({ approved: true }), routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.verification).toEqual(makeVerification());
    expect(fakeRepository.decide).toHaveBeenCalledWith("estate-1", "member-1", true);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "executor_verification_approved" }),
    );
  });

  it("declines — not a silent dead end — writes an audit log with the declined event, and returns 200", async () => {
    const declined = makeVerification({
      status: "declined",
      familyApprovedAt: null,
      familyApprovedByUserId: null,
      familyDeclinedAt: "2026-08-01T00:00:00.000Z",
      familyDeclinedByUserId: "user-1",
    });
    fakeRepository.decide = vi.fn().mockResolvedValue(declined);

    const response = await POST(postRequest({ approved: false }), routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.verification.status).toBe("declined");
    expect(fakeRepository.decide).toHaveBeenCalledWith("estate-1", "member-1", false);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "executor_verification_declined" }),
    );
  });
});
