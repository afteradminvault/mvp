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
    status: "terms_accepted",
    idDocumentStoragePath: null,
    legalTermsAcceptedAt: "2026-08-01T00:00:00.000Z",
    familyApprovedAt: null,
    familyApprovedByUserId: null,
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

beforeEach(() => {
  vi.clearAllMocks();
  fakeRepository = {
    getVerification: vi.fn(),
    uploadIdDocument: vi.fn(),
    acceptLegalTerms: vi.fn().mockResolvedValue(makeVerification()),
    decide: vi.fn(),
  };
  requireSessionMock.mockResolvedValue({ supabase: {}, userId: "user-1" });
});

describe("POST /api/estates/:id/members/:memberId/verification/accept-terms", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });

    const response = await POST(new Request("http://localhost", { method: "POST" }), routeParams());
    expect(response.status).toBe(401);
    expect(fakeRepository.acceptLegalTerms).not.toHaveBeenCalled();
  });

  it("returns 403 when the caller isn't the nominated executor", async () => {
    fakeRepository.acceptLegalTerms = vi
      .fn()
      .mockRejectedValue(new Error("only the nominated executor may accept their own legal terms"));

    const response = await POST(new Request("http://localhost", { method: "POST" }), routeParams());
    expect(response.status).toBe(403);
  });

  it("records acceptance, writes an audit log, and returns 200", async () => {
    const response = await POST(new Request("http://localhost", { method: "POST" }), routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.verification).toEqual(makeVerification());
    expect(fakeRepository.acceptLegalTerms).toHaveBeenCalledWith("estate-1", "member-1");
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "executor_legal_terms_accepted", targetId: "verification-1" }),
    );
  });
});
