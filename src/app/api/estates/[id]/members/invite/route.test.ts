import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EstateMember, MembershipRepository } from "@/domain/membership/ports";
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

const sendNominationInviteEmailMock = vi.fn();
vi.mock("@/infrastructure/email/resend-email-sender", () => ({
  ResendEmailSender: vi.fn().mockImplementation(function ResendEmailSender() {
    return { sendNominationInviteEmail: sendNominationInviteEmailMock };
  }),
}));

function createFakeMembershipRepository(overrides: Partial<MembershipRepository> = {}): MembershipRepository {
  return {
    inviteMember: vi.fn(),
    listMembers: vi.fn(),
    getInvitePreview: vi.fn(),
    acceptInvite: vi.fn(),
    getMemberPublicKeys: vi.fn(),
    wrapKeyShareForMember: vi.fn(),
    revokeMember: vi.fn(),
    ...overrides,
  };
}

let fakeMembershipRepository: MembershipRepository;
vi.mock("@/infrastructure/membership/supabase-membership-repository", () => ({
  SupabaseMembershipRepository: vi.fn().mockImplementation(function SupabaseMembershipRepository() {
    return fakeMembershipRepository;
  }),
}));

function makeEstate(overrides: Partial<Estate> = {}): Estate {
  return {
    id: "estate-1",
    ownerUserId: "user-1",
    jurisdictionId: "jurisdiction-1",
    displayName: "Diane's Estate",
    status: "setup",
    checkInIntervalDays: 90,
    lastCheckInAt: "2026-07-21T00:00:00.000Z",
    gracePeriodDays: 14,
    verificationStartedAt: null,
    selfCancelWindowDays: 7,
    createdAt: "2026-07-21T00:00:00.000Z",
    updatedAt: "2026-07-21T00:00:00.000Z",
    closedAt: null,
    deceasedFullName: null,
    deceasedDateOfBirth: null,
    deceasedRelationship: null,
    deceasedDateOfDeath: null,
    draftStep: null,
    draftPayload: {},
    ...overrides,
  };
}

let fakeEstateRepository: EstateRepository;
vi.mock("@/infrastructure/estates/supabase-estate-repository", () => ({
  SupabaseEstateRepository: vi.fn().mockImplementation(function SupabaseEstateRepository() {
    return fakeEstateRepository;
  }),
}));

function makeMember(overrides: Partial<EstateMember> = {}): EstateMember {
  return {
    id: "member-1",
    estateId: "estate-1",
    userId: null,
    role: "executor",
    inviteEmail: "marcus@example.com",
    inviteStatus: "pending",
    invitedAt: "2026-07-21T00:00:00.000Z",
    acceptedAt: null,
    fallbackOrder: null,
    hasWrappedVaultKey: false,
    createdAt: "2026-07-21T00:00:00.000Z",
    inviteToken: "abc-123-token",
    ...overrides,
  };
}

function routeParams(id = "estate-1") {
  return { params: Promise.resolve({ id }) };
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/estates/estate-1/members/invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeMembershipRepository = createFakeMembershipRepository();
  fakeEstateRepository = {
    createEstate: vi.fn(),
    getEstate: vi.fn().mockResolvedValue(makeEstate()),
    updateEstate: vi.fn(),
    recordCheckIn: vi.fn(),
    listMyEstates: vi.fn(),
    listSupportedJurisdictions: vi.fn(),
    createDraftCase: vi.fn(),
    saveDraftProgress: vi.fn(),
    activateDraftCase: vi.fn(),
  };
  sendNominationInviteEmailMock.mockResolvedValue(false);
  requireSessionMock.mockResolvedValue({ supabase: {}, userId: "user-1" });
});

describe("POST /api/estates/:id/members/invite", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });

    const response = await POST(postRequest({ inviteEmail: "marcus@example.com", role: "executor" }), routeParams());
    expect(response.status).toBe(401);
    expect(fakeMembershipRepository.inviteMember).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid JSON body", async () => {
    const response = await POST(postRequest("not json"), routeParams());
    expect(response.status).toBe(400);
  });

  it("returns 400 when inviteEmail or role is missing", async () => {
    const response = await POST(postRequest({ role: "executor" }), routeParams());
    expect(response.status).toBe(400);
  });

  it("returns 400 (via the real MembershipService validation) for an invalid email", async () => {
    const response = await POST(postRequest({ inviteEmail: "not-an-email", role: "executor" }), routeParams());
    expect(response.status).toBe(400);
    expect(fakeMembershipRepository.inviteMember).not.toHaveBeenCalled();
  });

  it("returns 403 when the caller is not the estate owner", async () => {
    fakeMembershipRepository.inviteMember = vi
      .fn()
      .mockRejectedValue(new Error("only the case owner can invite members"));

    const response = await POST(postRequest({ inviteEmail: "marcus@example.com", role: "executor" }), routeParams());
    expect(response.status).toBe(403);
  });

  it("creates the invite, includes a shareable link, writes an audit log, and returns 201 (emailSent: false when Resend isn't configured)", async () => {
    const member = makeMember();
    fakeMembershipRepository.inviteMember = vi.fn().mockResolvedValue(member);

    const response = await POST(postRequest({ inviteEmail: "marcus@example.com", role: "executor" }), routeParams());
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.member).toEqual(member);
    expect(body.inviteUrl).toContain("abc-123-token");
    expect(body.emailSent).toBe(false);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "member_invited", targetId: member.id }),
    );
  });

  it("sends the nomination-invite email with the estate's display name when Resend is configured", async () => {
    const member = makeMember();
    fakeMembershipRepository.inviteMember = vi.fn().mockResolvedValue(member);
    sendNominationInviteEmailMock.mockResolvedValue(true);

    const response = await POST(postRequest({ inviteEmail: "marcus@example.com", role: "executor" }), routeParams());
    const body = await response.json();

    expect(body.emailSent).toBe(true);
    expect(sendNominationInviteEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        toEmail: "marcus@example.com",
        estateDisplayName: "Diane's Estate",
        role: "executor",
        inviteUrl: expect.stringContaining("abc-123-token"),
      }),
    );
  });

  it("still returns 201 with the shareable link even if the email send fails", async () => {
    const member = makeMember();
    fakeMembershipRepository.inviteMember = vi.fn().mockResolvedValue(member);
    sendNominationInviteEmailMock.mockResolvedValue(false);

    const response = await POST(postRequest({ inviteEmail: "marcus@example.com", role: "executor" }), routeParams());
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.inviteUrl).toContain("abc-123-token");
    expect(body.emailSent).toBe(false);
  });
});
