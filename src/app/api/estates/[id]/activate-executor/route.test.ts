import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentRepository } from "@/domain/documents/ports";
import { POST } from "./route";

const requireSessionMock = vi.fn();
vi.mock("@/app/api/_lib/require-session", () => ({
  requireSession: () => requireSessionMock(),
}));

let fakeRepository: DocumentRepository;
vi.mock("@/infrastructure/documents/supabase-document-repository", () => ({
  SupabaseDocumentRepository: vi.fn().mockImplementation(function SupabaseDocumentRepository() {
    return fakeRepository;
  }),
}));

function routeParams(id = "estate-1") {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeRepository = {
    listDocuments: vi.fn(),
    getDocument: vi.fn(),
    uploadDocument: vi.fn(),
    createSignedDownloadUrl: vi.fn(),
    deleteDocument: vi.fn(),
    isAttachedToAnyClosureRequest: vi.fn(),
    activateExecutorIfCertified: vi.fn(),
  };
  requireSessionMock.mockResolvedValue({ supabase: {}, userId: "user-1" });
});

describe("POST /api/estates/:id/activate-executor", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });
    const response = await POST(new Request("http://localhost", { method: "POST" }), routeParams());
    expect(response.status).toBe(401);
  });

  it("returns 403 when the caller isn't the owner or an accepted executor", async () => {
    fakeRepository.activateExecutorIfCertified = vi
      .fn()
      .mockRejectedValue(new Error("only the owner or an accepted executor may activate executor access"));
    const response = await POST(new Request("http://localhost", { method: "POST" }), routeParams());
    expect(response.status).toBe(403);
  });

  it("returns 409 when the gate isn't open yet", async () => {
    fakeRepository.activateExecutorIfCertified = vi.fn().mockResolvedValue(null);
    const response = await POST(new Request("http://localhost", { method: "POST" }), routeParams());
    expect(response.status).toBe(409);
  });

  it("returns the activated estate on success", async () => {
    fakeRepository.activateExecutorIfCertified = vi
      .fn()
      .mockResolvedValue({ id: "estate-1", status: "active_executor" });
    const response = await POST(new Request("http://localhost", { method: "POST" }), routeParams());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.estate).toEqual({ id: "estate-1", status: "active_executor" });
  });
});
