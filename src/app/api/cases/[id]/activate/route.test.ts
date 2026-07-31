import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Estate, EstateRepository } from "@/domain/estates/ports";
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

const sendCaseSetupConfirmationEmailMock = vi.fn();
vi.mock("@/infrastructure/email/resend-email-sender", () => ({
  ResendEmailSender: vi.fn().mockImplementation(function ResendEmailSender() {
    return { sendCaseSetupConfirmationEmail: sendCaseSetupConfirmationEmailMock };
  }),
}));

function createFakeRepository(overrides: Partial<EstateRepository> = {}): EstateRepository {
  return {
    createEstate: vi.fn(),
    getEstate: vi.fn(),
    updateEstate: vi.fn(),
    recordCheckIn: vi.fn(),
    listMyEstates: vi.fn(),
    listSupportedJurisdictions: vi.fn(),
    createDraftCase: vi.fn(),
    saveDraftProgress: vi.fn(),
    activateDraftCase: vi.fn(),
    ...overrides,
  };
}

let fakeRepository: EstateRepository;
vi.mock("@/infrastructure/estates/supabase-estate-repository", () => ({
  SupabaseEstateRepository: vi.fn().mockImplementation(function SupabaseEstateRepository() {
    return fakeRepository;
  }),
}));

function makeEstate(overrides: Partial<Estate> = {}): Estate {
  return {
    id: "estate-1",
    ownerUserId: "user-1",
    jurisdictionId: "jurisdiction-1",
    displayName: "Diane Whitfield's Case",
    status: "draft",
    checkInIntervalDays: 90,
    lastCheckInAt: "2026-07-30T00:00:00.000Z",
    gracePeriodDays: 14,
    verificationStartedAt: null,
    selfCancelWindowDays: 7,
    createdAt: "2026-07-30T00:00:00.000Z",
    updatedAt: "2026-07-30T00:00:00.000Z",
    closedAt: null,
    deceasedFullName: "Diane Whitfield",
    deceasedDateOfBirth: "1950-01-01",
    deceasedRelationship: "mother",
    deceasedDateOfDeath: null,
    draftStep: null,
    draftPayload: {},
    isSelfPlanned: false,
    acquisitionBrand: "unknown",
    ...overrides,
  };
}

function routeParams(id = "estate-1") {
  return { params: Promise.resolve({ id }) };
}

function fakeSupabase() {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { email: "diane-owner@example.com" } } }) },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeRepository = createFakeRepository();
  sendCaseSetupConfirmationEmailMock.mockResolvedValue(false);
  requireSessionMock.mockResolvedValue({ supabase: fakeSupabase(), userId: "user-1" });
});

describe("POST /api/cases/:id/activate", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });

    const response = await POST(new Request("http://localhost"), routeParams());
    expect(response.status).toBe(401);
    expect(fakeRepository.activateDraftCase).not.toHaveBeenCalled();
  });

  it("returns 400 (via the real EstateService validation) when the case is not in draft status", async () => {
    fakeRepository.getEstate = vi.fn().mockResolvedValue(makeEstate({ status: "active_living" }));

    const response = await POST(new Request("http://localhost"), routeParams());

    expect(response.status).toBe(400);
    expect(fakeRepository.activateDraftCase).not.toHaveBeenCalled();
  });

  it("activates the case, sends the confirmation email, logs the outcome, and returns 200", async () => {
    fakeRepository.getEstate = vi.fn().mockResolvedValue(makeEstate());
    const activated = makeEstate({ status: "active_living" });
    fakeRepository.activateDraftCase = vi.fn().mockResolvedValue(activated);
    sendCaseSetupConfirmationEmailMock.mockResolvedValue(true);

    const response = await POST(new Request("http://localhost"), routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.case).toEqual(activated);
    expect(body.emailSent).toBe(true);
    expect(fakeRepository.activateDraftCase).toHaveBeenCalledWith("estate-1");
    expect(sendCaseSetupConfirmationEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ toEmail: "diane-owner@example.com", caseDisplayName: activated.displayName }),
    );
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "case_setup_confirmation_sent", targetId: "estate-1" }),
    );
  });

  it("still returns 200 with emailSent: false when Resend isn't configured", async () => {
    fakeRepository.getEstate = vi.fn().mockResolvedValue(makeEstate());
    fakeRepository.activateDraftCase = vi.fn().mockResolvedValue(makeEstate({ status: "active_living" }));

    const response = await POST(new Request("http://localhost"), routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.emailSent).toBe(false);
  });
});
