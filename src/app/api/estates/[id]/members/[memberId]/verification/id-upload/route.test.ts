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
    status: "id_uploaded",
    idDocumentStoragePath: "estate-1/executor-verification/member-1",
    legalTermsAcceptedAt: null,
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

function uploadRequest(fields: Record<string, string | Blob>): Request {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, value);
  }
  return new Request("http://localhost/api/estates/estate-1/members/member-1/verification/id-upload", {
    method: "POST",
    body: formData,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeRepository = {
    getVerification: vi.fn(),
    uploadIdDocument: vi.fn().mockResolvedValue(makeVerification()),
    acceptLegalTerms: vi.fn(),
    decide: vi.fn(),
  };
  requireSessionMock.mockResolvedValue({ supabase: {}, userId: "user-1" });
});

describe("POST /api/estates/:id/members/:memberId/verification/id-upload", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });

    const response = await POST(uploadRequest({}), routeParams());
    expect(response.status).toBe(401);
    expect(fakeRepository.uploadIdDocument).not.toHaveBeenCalled();
  });

  it("returns 400 when no file is provided", async () => {
    const response = await POST(uploadRequest({}), routeParams());
    expect(response.status).toBe(400);
  });

  it("returns 400 (via the real service validation) for a disallowed mime type", async () => {
    const file = new Blob(["abc"], { type: "application/x-msdownload" });
    const response = await POST(uploadRequest({ file, fileName: "id.exe" }), routeParams());
    expect(response.status).toBe(400);
    expect(fakeRepository.uploadIdDocument).not.toHaveBeenCalled();
  });

  it("returns 403 when the caller isn't the nominated executor", async () => {
    fakeRepository.uploadIdDocument = vi
      .fn()
      .mockRejectedValue(new Error("only the nominated executor may upload their own verification id"));
    const file = new Blob(["abc"], { type: "image/jpeg" });

    const response = await POST(uploadRequest({ file, fileName: "id.jpg" }), routeParams());
    expect(response.status).toBe(403);
  });

  it("uploads the id document, writes an audit log, and returns 201", async () => {
    const file = new Blob(["abc"], { type: "image/jpeg" });
    const response = await POST(uploadRequest({ file, fileName: "id.jpg" }), routeParams());
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.verification).toEqual(makeVerification());
    expect(fakeRepository.uploadIdDocument).toHaveBeenCalledWith(
      "estate-1",
      "member-1",
      expect.objectContaining({ fileName: "id.jpg", mimeType: "image/jpeg" }),
    );
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "executor_id_document_uploaded", targetId: "verification-1" }),
    );
  });
});
