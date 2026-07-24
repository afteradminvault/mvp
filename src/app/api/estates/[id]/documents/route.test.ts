import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Document, DocumentRepository } from "@/domain/documents/ports";
import { GET, POST } from "./route";

const requireSessionMock = vi.fn();
vi.mock("@/app/api/_lib/require-session", () => ({
  requireSession: () => requireSessionMock(),
}));

const writeAuditLogMock = vi.fn();
vi.mock("@/app/api/_lib/audit-log", () => ({
  writeAuditLog: (...args: unknown[]) => writeAuditLogMock(...args),
}));

function makeDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: "doc-1",
    estateId: "estate-1",
    uploadedByUserId: "user-1",
    documentType: "death_certificate",
    storagePath: "estate-1/doc-1",
    fileName: "certificate.pdf",
    mimeType: "application/pdf",
    fileSizeBytes: 3,
    isCertifiedOriginal: false,
    notes: null,
    uploadedAt: "2026-07-24T00:00:00.000Z",
    ...overrides,
  };
}

let fakeRepository: DocumentRepository;
vi.mock("@/infrastructure/documents/supabase-document-repository", () => ({
  SupabaseDocumentRepository: vi.fn().mockImplementation(function SupabaseDocumentRepository() {
    return fakeRepository;
  }),
}));

function routeParams(id = "estate-1") {
  return { params: Promise.resolve({ id }) };
}

function uploadRequest(fields: Record<string, string | Blob>): Request {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, value);
  }
  return new Request("http://localhost/api/estates/estate-1/documents", { method: "POST", body: formData });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeRepository = {
    listDocuments: vi.fn().mockResolvedValue([]),
    getDocument: vi.fn(),
    uploadDocument: vi.fn().mockResolvedValue(makeDocument()),
    createSignedDownloadUrl: vi.fn(),
    deleteDocument: vi.fn(),
    isAttachedToAnyClosureRequest: vi.fn(),
    activateExecutorIfCertified: vi.fn().mockResolvedValue(null),
  };
  requireSessionMock.mockResolvedValue({ supabase: {}, userId: "user-1" });
});

describe("GET /api/estates/:id/documents", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });
    const response = await GET(new Request("http://localhost"), routeParams());
    expect(response.status).toBe(401);
  });

  it("lists documents for the estate", async () => {
    fakeRepository.listDocuments = vi.fn().mockResolvedValue([makeDocument()]);
    const response = await GET(new Request("http://localhost"), routeParams());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.documents).toEqual([makeDocument()]);
  });
});

describe("POST /api/estates/:id/documents", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });
    const response = await POST(uploadRequest({}), routeParams());
    expect(response.status).toBe(401);
    expect(fakeRepository.uploadDocument).not.toHaveBeenCalled();
  });

  it("returns 400 when no file is provided", async () => {
    const response = await POST(
      uploadRequest({ documentType: "death_certificate" }),
      routeParams(),
    );
    expect(response.status).toBe(400);
  });

  it("returns 400 (via the real DocumentService validation) for an invalid documentType", async () => {
    const file = new Blob(["abc"], { type: "application/pdf" });
    const response = await POST(
      uploadRequest({ file, documentType: "not-a-real-type", fileName: "a.pdf" }),
      routeParams(),
    );
    expect(response.status).toBe(400);
    expect(fakeRepository.uploadDocument).not.toHaveBeenCalled();
  });

  it("uploads the document, writes an audit log, and returns 201 with no activation", async () => {
    const file = new Blob(["abc"], { type: "application/pdf" });
    const response = await POST(
      uploadRequest({ file, documentType: "death_certificate", fileName: "certificate.pdf" }),
      routeParams(),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.document).toEqual(makeDocument());
    expect(body.activatedEstate).toBeNull();
    expect(fakeRepository.uploadDocument).toHaveBeenCalledWith(
      "estate-1",
      "user-1",
      expect.objectContaining({ documentType: "death_certificate", fileName: "certificate.pdf", mimeType: "application/pdf" }),
    );
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "document_uploaded", targetId: "doc-1" }),
    );
  });

  it("reports the activated estate when the death-certificate gate fires", async () => {
    fakeRepository.activateExecutorIfCertified = vi.fn().mockResolvedValue({ id: "estate-1", status: "active_executor" });
    const file = new Blob(["abc"], { type: "application/pdf" });
    const response = await POST(
      uploadRequest({ file, documentType: "death_certificate", fileName: "certificate.pdf" }),
      routeParams(),
    );
    const body = await response.json();

    expect(body.activatedEstate).toEqual({ id: "estate-1", status: "active_executor" });
  });
});
