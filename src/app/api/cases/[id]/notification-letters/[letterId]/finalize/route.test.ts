import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EstateRepository } from "@/domain/estates/ports";
import type { Platform, PlatformRepository } from "@/domain/platforms/ports";
import type { Document, DocumentRepository } from "@/domain/documents/ports";
import type { NotificationLetter, NotificationLetterRepository } from "@/domain/notification-letters/ports";
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

let fakeLetterRepository: NotificationLetterRepository;
vi.mock("@/infrastructure/notification-letters/supabase-notification-letter-repository", () => ({
  SupabaseNotificationLetterRepository: vi.fn().mockImplementation(function SupabaseNotificationLetterRepository() {
    return fakeLetterRepository;
  }),
}));

let fakePlatformRepository: PlatformRepository;
vi.mock("@/infrastructure/platforms/supabase-platform-repository", () => ({
  SupabasePlatformRepository: vi.fn().mockImplementation(function SupabasePlatformRepository() {
    return fakePlatformRepository;
  }),
}));

let fakeDocumentRepository: DocumentRepository;
vi.mock("@/infrastructure/documents/supabase-document-repository", () => ({
  SupabaseDocumentRepository: vi.fn().mockImplementation(function SupabaseDocumentRepository() {
    return fakeDocumentRepository;
  }),
}));

vi.mock("@/infrastructure/estates/supabase-estate-repository", () => ({
  SupabaseEstateRepository: vi.fn().mockImplementation(function SupabaseEstateRepository() {
    return {} as EstateRepository;
  }),
}));

function makePlatform(overrides: Partial<Platform> = {}): Platform {
  return {
    id: "provider-1",
    name: "Chase",
    defaultCategory: "financial",
    logoUrl: null,
    closureMethod: "online_form",
    closureInstructions: null,
    bereavementContactEmail: "bereavement@chase.example",
    bereavementContactPhone: null,
    bereavementInstructionsUrl: null,
    websiteUrl: null,
    supportsMemorialize: false,
    ...overrides,
  };
}

function makeDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: "doc-1",
    estateId: "estate-1",
    uploadedByUserId: "user-1",
    documentType: "notification_letter",
    storagePath: "estate-1/doc-1",
    fileName: "notification-letter-Chase.pdf",
    mimeType: "application/pdf",
    fileSizeBytes: 100,
    isCertifiedOriginal: false,
    notes: null,
    uploadedAt: "2026-08-03T00:00:00.000Z",
    ...overrides,
  };
}

function makeLetter(overrides: Partial<NotificationLetter> = {}): NotificationLetter {
  return {
    id: "letter-1",
    estateId: "estate-1",
    platformId: "provider-1",
    createdByUserId: "user-1",
    letterType: "close",
    content: "To Whom It May Concern...",
    sentVia: "download",
    sentAt: "2026-08-03T01:00:00.000Z",
    pdfDocumentId: "doc-1",
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T01:00:00.000Z",
    ...overrides,
  };
}

function routeParams(id = "estate-1", letterId = "letter-1") {
  return { params: Promise.resolve({ id, letterId }) };
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/cases/estate-1/notification-letters/letter-1/finalize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeLetterRepository = {
    createLetter: vi.fn(),
    getLetter: vi.fn().mockResolvedValue(makeLetter({ sentAt: null, sentVia: null })),
    listLetters: vi.fn(),
    updateContent: vi.fn(),
    finalize: vi.fn().mockResolvedValue(makeLetter()),
    getUserDisplayName: vi.fn(),
  };
  fakePlatformRepository = { getPlatform: vi.fn().mockResolvedValue(makePlatform()) } as unknown as PlatformRepository;
  fakeDocumentRepository = {
    uploadDocument: vi.fn().mockResolvedValue(makeDocument()),
    createSignedDownloadUrl: vi.fn().mockResolvedValue("https://storage.example/signed-url"),
  } as unknown as DocumentRepository;
  requireSessionMock.mockResolvedValue({ supabase: {}, userId: "user-1" });
});

describe("POST /api/cases/:id/notification-letters/:letterId/finalize", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });

    const response = await POST(postRequest({ sentVia: "download" }), routeParams());
    expect(response.status).toBe(401);
    expect(fakeLetterRepository.finalize).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid sentVia", async () => {
    const response = await POST(postRequest({ sentVia: "fax" }), routeParams());
    expect(response.status).toBe(400);
    expect(fakeLetterRepository.finalize).not.toHaveBeenCalled();
  });

  it("finalizes, writes an audit log, and returns a signed download URL", async () => {
    const response = await POST(postRequest({ sentVia: "download" }), routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.letter).toEqual(makeLetter());
    expect(body.downloadUrl).toBe("https://storage.example/signed-url");
    expect(fakeDocumentRepository.uploadDocument).toHaveBeenCalled();
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "notification_letter_finalized" }),
    );
  });

  it("returns 409 when the letter was already finalized", async () => {
    fakeLetterRepository.getLetter = vi.fn().mockResolvedValue(makeLetter());

    const response = await POST(postRequest({ sentVia: "download" }), routeParams());
    expect(response.status).toBe(409);
  });
});
