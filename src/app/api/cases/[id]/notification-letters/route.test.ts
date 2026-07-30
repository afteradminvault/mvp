import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Estate, EstateRepository } from "@/domain/estates/ports";
import type { Platform, PlatformRepository } from "@/domain/platforms/ports";
import type { DocumentRepository } from "@/domain/documents/ports";
import type { NotificationLetter, NotificationLetterRepository } from "@/domain/notification-letters/ports";
import { GET, POST } from "./route";

const requireSessionMock = vi.fn();
vi.mock("@/app/api/_lib/require-session", () => ({
  requireSession: () => requireSessionMock(),
}));

const writeAuditLogMock = vi.fn();
vi.mock("@/app/api/_lib/audit-log", () => ({
  writeAuditLog: (...args: unknown[]) => writeAuditLogMock(...args),
}));

vi.mock("@/config/env", () => ({
  getServerEnv: () => ({ RESEND_API_KEY: undefined, RESEND_FROM_EMAIL: "AfterVault <onboarding@resend.dev>" }),
}));

let fakeLetterRepository: NotificationLetterRepository;
vi.mock("@/infrastructure/notification-letters/supabase-notification-letter-repository", () => ({
  SupabaseNotificationLetterRepository: vi.fn().mockImplementation(function SupabaseNotificationLetterRepository() {
    return fakeLetterRepository;
  }),
}));

let fakeEstateRepository: EstateRepository;
vi.mock("@/infrastructure/estates/supabase-estate-repository", () => ({
  SupabaseEstateRepository: vi.fn().mockImplementation(function SupabaseEstateRepository() {
    return fakeEstateRepository;
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

function makeEstate(overrides: Partial<Estate> = {}): Estate {
  return {
    id: "estate-1",
    ownerUserId: "user-1",
    jurisdictionId: "jurisdiction-1",
    displayName: "Diane Whitfield's Case",
    status: "active_living",
    checkInIntervalDays: 90,
    lastCheckInAt: "2026-08-03T00:00:00.000Z",
    gracePeriodDays: 14,
    verificationStartedAt: null,
    selfCancelWindowDays: 7,
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T00:00:00.000Z",
    closedAt: null,
    deceasedFullName: "Diane Whitfield",
    deceasedDateOfBirth: "1950-01-01",
    deceasedRelationship: "mother",
    deceasedDateOfDeath: "2026-07-01",
    draftStep: null,
    draftPayload: {},
    isSelfPlanned: false,
    ...overrides,
  };
}

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

function routeParams(id = "estate-1") {
  return { params: Promise.resolve({ id }) };
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/cases/estate-1/notification-letters", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeLetterRepository = {
    createLetter: vi.fn().mockResolvedValue(makeLetter()),
    getLetter: vi.fn(),
    listLetters: vi.fn().mockResolvedValue([]),
    updateContent: vi.fn(),
    finalize: vi.fn(),
    getUserDisplayName: vi.fn().mockResolvedValue("Marcus Whitfield"),
  };
  fakeEstateRepository = { getEstate: vi.fn().mockResolvedValue(makeEstate()) } as unknown as EstateRepository;
  fakePlatformRepository = { getPlatform: vi.fn().mockResolvedValue(makePlatform()) } as unknown as PlatformRepository;
  fakeDocumentRepository = {} as DocumentRepository;
  requireSessionMock.mockResolvedValue({ supabase: {}, userId: "user-1" });
});

describe("GET /api/cases/:id/notification-letters", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });

    const response = await GET(new Request("http://localhost"), routeParams());
    expect(response.status).toBe(401);
  });

  it("returns the letters for the case (US-6.6 log)", async () => {
    const letters = [makeLetter({ sentVia: "email", sentAt: "2026-08-03T01:00:00.000Z" })];
    fakeLetterRepository.listLetters = vi.fn().mockResolvedValue(letters);

    const response = await GET(new Request("http://localhost"), routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.letters).toEqual(letters);
  });
});

describe("POST /api/cases/:id/notification-letters", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });

    const response = await POST(postRequest({ platformId: "provider-1", letterType: "close" }), routeParams());
    expect(response.status).toBe(401);
    expect(fakeLetterRepository.createLetter).not.toHaveBeenCalled();
  });

  it("returns 400 (via the real service validation) for an invalid letterType", async () => {
    const response = await POST(postRequest({ platformId: "provider-1", letterType: "not-a-type" }), routeParams());
    expect(response.status).toBe(400);
    expect(fakeLetterRepository.createLetter).not.toHaveBeenCalled();
  });

  it("generates the letter, writes an audit log, and returns 201", async () => {
    const letter = makeLetter();
    fakeLetterRepository.createLetter = vi.fn().mockResolvedValue(letter);

    const response = await POST(postRequest({ platformId: "provider-1", letterType: "close" }), routeParams());
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.letter).toEqual(letter);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "notification_letter_generated", targetId: letter.id }),
    );
  });
});
