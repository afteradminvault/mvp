import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EstateMember, MembershipRepository } from "@/domain/membership/ports";
import { POST } from "./route";

const requireSessionMock = vi.fn();
vi.mock("@/app/api/_lib/require-session", () => ({
  requireSession: () => requireSessionMock(),
}));

const writeAuditLogMock = vi.fn();
vi.mock("@/app/api/_lib/audit-log", () => ({
  writeAuditLog: (...args: unknown[]) => writeAuditLogMock(...args),
}));

function createFakeRepository(overrides: Partial<MembershipRepository> = {}): MembershipRepository {
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

let fakeRepository: MembershipRepository;
vi.mock("@/infrastructure/membership/supabase-membership-repository", () => ({
  SupabaseMembershipRepository: vi.fn().mockImplementation(function SupabaseMembershipRepository() {
    return fakeRepository;
  }),
}));

function makeMember(overrides: Partial<EstateMember> = {}): EstateMember {
  return {
    id: "member-1",
    estateId: "estate-1",
    userId: "user-2",
    role: "executor",
    inviteEmail: "marcus@example.com",
    inviteStatus: "accepted",
    invitedAt: "2026-07-21T00:00:00.000Z",
    acceptedAt: "2026-07-21T00:00:00.000Z",
    fallbackOrder: null,
    hasWrappedVaultKey: false,
    createdAt: "2026-07-21T00:00:00.000Z",
    inviteToken: null,
    ...overrides,
  };
}

function routeParams(token = "some-token") {
  return { params: Promise.resolve({ token }) };
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/invites/some-token/accept", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeRepository = createFakeRepository();
  requireSessionMock.mockResolvedValue({ supabase: {}, userId: "user-2" });
});

describe("POST /api/invites/:token/accept", () => {
  it("returns 401 when there is no session (invitee must already be logged in)", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });

    const response = await POST(
      postRequest({ publicKey: "aabbcc", wrappedPrivateKey: "112233", kdfSalt: "445566" }),
      routeParams(),
    );
    expect(response.status).toBe(401);
    expect(fakeRepository.acceptInvite).not.toHaveBeenCalled();
  });

  it("returns 400 when a required field is missing", async () => {
    const response = await POST(postRequest({ publicKey: "aabbcc" }), routeParams());
    expect(response.status).toBe(400);
  });

  it("returns 410 for an invalid or expired invite", async () => {
    fakeRepository.acceptInvite = vi.fn().mockRejectedValue(new Error("invite has expired"));

    const response = await POST(
      postRequest({ publicKey: "aabbcc", wrappedPrivateKey: "112233", kdfSalt: "445566" }),
      routeParams(),
    );
    expect(response.status).toBe(410);
  });

  it("accepts the invite, writes an audit log, and returns 200", async () => {
    const member = makeMember();
    fakeRepository.acceptInvite = vi.fn().mockResolvedValue(member);

    const response = await POST(
      postRequest({ publicKey: "aabbcc", wrappedPrivateKey: "112233", kdfSalt: "445566" }),
      routeParams(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.member).toEqual(member);
    expect(fakeRepository.acceptInvite).toHaveBeenCalledWith("some-token", {
      publicKey: "aabbcc",
      wrappedPrivateKey: "112233",
      kdfSalt: "445566",
    });
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "member_invite_accepted", estateId: member.estateId }),
    );
  });
});
