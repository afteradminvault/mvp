import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EstateRepository } from "@/domain/estates/ports";
import type { PlatformRepository } from "@/domain/platforms/ports";
import type { DocumentRepository } from "@/domain/documents/ports";
import type { NotificationLetter, NotificationLetterRepository } from "@/domain/notification-letters/ports";
import { GET, PATCH } from "./route";

const requireSessionMock = vi.fn();
vi.mock("@/app/api/_lib/require-session", () => ({
  requireSession: () => requireSessionMock(),
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
vi.mock("@/infrastructure/estates/supabase-estate-repository", () => ({
  SupabaseEstateRepository: vi.fn().mockImplementation(function SupabaseEstateRepository() {
    return {} as EstateRepository;
  }),
}));
vi.mock("@/infrastructure/platforms/supabase-platform-repository", () => ({
  SupabasePlatformRepository: vi.fn().mockImplementation(function SupabasePlatformRepository() {
    return {} as PlatformRepository;
  }),
}));
vi.mock("@/infrastructure/documents/supabase-document-repository", () => ({
  SupabaseDocumentRepository: vi.fn().mockImplementation(function SupabaseDocumentRepository() {
    return {} as DocumentRepository;
  }),
}));

function makeLetter(overrides: Partial<NotificationLetter> = {}): NotificationLetter {
  return {
    id: "letter-1",
    estateId: "estate-1",
    platformId: "provider-1",
    createdByUserId: "user-1",
    letterType: "close",
    content: "To Whom It May Concern...",
    sentVia: null,
    sentAt: null,
    pdfDocumentId: null,
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T00:00:00.000Z",
    ...overrides,
  };
}

function routeParams(id = "estate-1", letterId = "letter-1") {
  return { params: Promise.resolve({ id, letterId }) };
}

function patchRequest(body: unknown): Request {
  return new Request("http://localhost/api/cases/estate-1/notification-letters/letter-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeLetterRepository = {
    createLetter: vi.fn(),
    getLetter: vi.fn().mockResolvedValue(makeLetter()),
    listLetters: vi.fn(),
    updateContent: vi.fn().mockResolvedValue(makeLetter({ content: "Edited" })),
    finalize: vi.fn(),
    getUserDisplayName: vi.fn(),
  };
  requireSessionMock.mockResolvedValue({ supabase: {}, userId: "user-1" });
});

describe("GET /api/cases/:id/notification-letters/:letterId", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });

    const response = await GET(new Request("http://localhost"), routeParams());
    expect(response.status).toBe(401);
  });

  it("returns 404 when the letter doesn't exist", async () => {
    fakeLetterRepository.getLetter = vi.fn().mockResolvedValue(null);

    const response = await GET(new Request("http://localhost"), routeParams());
    expect(response.status).toBe(404);
  });

  it("returns the letter", async () => {
    const letter = makeLetter();
    const response = await GET(new Request("http://localhost"), routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.letter).toEqual(letter);
  });
});

describe("PATCH /api/cases/:id/notification-letters/:letterId", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });

    const response = await PATCH(patchRequest({ content: "Edited" }), routeParams());
    expect(response.status).toBe(401);
    expect(fakeLetterRepository.updateContent).not.toHaveBeenCalled();
  });

  it("returns 409 when the letter is already finalized", async () => {
    fakeLetterRepository.getLetter = vi
      .fn()
      .mockResolvedValue(makeLetter({ sentAt: "2026-08-03T01:00:00.000Z", sentVia: "email" }));

    const response = await PATCH(patchRequest({ content: "Edited" }), routeParams());
    expect(response.status).toBe(409);
    expect(fakeLetterRepository.updateContent).not.toHaveBeenCalled();
  });

  it("updates the content and returns 200", async () => {
    const response = await PATCH(patchRequest({ content: "Edited content" }), routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.letter.content).toBe("Edited");
    expect(fakeLetterRepository.updateContent).toHaveBeenCalledWith("letter-1", "Edited content");
  });
});
