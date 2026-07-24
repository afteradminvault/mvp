import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentRepository } from "@/domain/documents/ports";
import { DELETE, GET } from "./route";

const requireSessionMock = vi.fn();
vi.mock("@/app/api/_lib/require-session", () => ({
  requireSession: () => requireSessionMock(),
}));

const writeAuditLogMock = vi.fn();
vi.mock("@/app/api/_lib/audit-log", () => ({
  writeAuditLog: (...args: unknown[]) => writeAuditLogMock(...args),
}));

let fakeRepository: DocumentRepository;
vi.mock("@/infrastructure/documents/supabase-document-repository", () => ({
  SupabaseDocumentRepository: vi.fn().mockImplementation(function SupabaseDocumentRepository() {
    return fakeRepository;
  }),
}));

function routeParams(id = "estate-1", docId = "doc-1") {
  return { params: Promise.resolve({ id, docId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeRepository = {
    listDocuments: vi.fn(),
    getDocument: vi.fn(),
    uploadDocument: vi.fn(),
    createSignedDownloadUrl: vi.fn().mockResolvedValue("https://signed.example/url"),
    deleteDocument: vi.fn().mockResolvedValue(undefined),
    isAttachedToAnyClosureRequest: vi.fn().mockResolvedValue(false),
    activateExecutorIfCertified: vi.fn(),
  };
  requireSessionMock.mockResolvedValue({ supabase: {}, userId: "user-1" });
});

describe("GET /api/estates/:id/documents/:docId", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });
    const response = await GET(new Request("http://localhost"), routeParams());
    expect(response.status).toBe(401);
  });

  it("returns 404 when the document doesn't exist or isn't accessible", async () => {
    fakeRepository.createSignedDownloadUrl = vi.fn().mockResolvedValue(null);
    const response = await GET(new Request("http://localhost"), routeParams());
    expect(response.status).toBe(404);
  });

  it("returns a signed download URL and logs the access", async () => {
    const response = await GET(new Request("http://localhost"), routeParams());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.downloadUrl).toBe("https://signed.example/url");
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "document_downloaded", targetId: "doc-1" }),
    );
  });
});

describe("DELETE /api/estates/:id/documents/:docId", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });
    const response = await DELETE(new Request("http://localhost"), routeParams());
    expect(response.status).toBe(401);
    expect(fakeRepository.deleteDocument).not.toHaveBeenCalled();
  });

  it("returns 409 when the document is attached to a closure request", async () => {
    fakeRepository.isAttachedToAnyClosureRequest = vi.fn().mockResolvedValue(true);
    const response = await DELETE(new Request("http://localhost"), routeParams());
    expect(response.status).toBe(409);
    expect(fakeRepository.deleteDocument).not.toHaveBeenCalled();
  });

  it("deletes and logs when not attached to anything", async () => {
    const response = await DELETE(new Request("http://localhost"), routeParams());
    expect(response.status).toBe(200);
    expect(fakeRepository.deleteDocument).toHaveBeenCalledWith("estate-1", "doc-1");
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "document_deleted", targetId: "doc-1" }),
    );
  });
});
