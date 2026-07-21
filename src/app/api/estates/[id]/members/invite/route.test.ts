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
  fakeRepository = createFakeRepository();
  requireSessionMock.mockResolvedValue({ supabase: {}, userId: "user-1" });
});

describe("POST /api/estates/:id/members/invite", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });

    const response = await POST(postRequest({ inviteEmail: "marcus@example.com", role: "executor" }), routeParams());
    expect(response.status).toBe(401);
    expect(fakeRepository.inviteMember).not.toHaveBeenCalled();
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
    expect(fakeRepository.inviteMember).not.toHaveBeenCalled();
  });

  it("returns 403 when the caller is not the estate owner", async () => {
    fakeRepository.inviteMember = vi
      .fn()
      .mockRejectedValue(new Error("only the estate owner can invite members"));

    const response = await POST(postRequest({ inviteEmail: "marcus@example.com", role: "executor" }), routeParams());
    expect(response.status).toBe(403);
  });

  it("creates the invite, includes a shareable link, writes an audit log, and returns 201", async () => {
    const member = makeMember();
    fakeRepository.inviteMember = vi.fn().mockResolvedValue(member);

    const response = await POST(postRequest({ inviteEmail: "marcus@example.com", role: "executor" }), routeParams());
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.member).toEqual(member);
    expect(body.inviteUrl).toContain("abc-123-token");
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "member_invited", targetId: member.id }),
    );
  });
});
