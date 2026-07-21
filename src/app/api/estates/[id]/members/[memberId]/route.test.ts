import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EstateMember, MembershipRepository } from "@/domain/membership/ports";
import { DELETE } from "./route";

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
    hasWrappedVaultKey: true,
    createdAt: "2026-07-21T00:00:00.000Z",
    inviteToken: null,
    ...overrides,
  };
}

function routeParams(id = "estate-1", memberId = "member-1") {
  return { params: Promise.resolve({ id, memberId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeRepository = createFakeRepository();
  requireSessionMock.mockResolvedValue({ supabase: {}, userId: "user-1" });
});

describe("DELETE /api/estates/:id/members/:memberId (revoke)", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });

    const response = await DELETE(new Request("http://localhost"), routeParams());
    expect(response.status).toBe(401);
    expect(fakeRepository.revokeMember).not.toHaveBeenCalled();
  });

  it("returns 403 when the caller is not the estate owner", async () => {
    fakeRepository.revokeMember = vi.fn().mockRejectedValue(new Error("only the estate owner can revoke a member"));

    const response = await DELETE(new Request("http://localhost"), routeParams());
    expect(response.status).toBe(403);
  });

  it("returns 404 when the member does not exist", async () => {
    fakeRepository.revokeMember = vi.fn().mockRejectedValue(new Error("member not found"));

    const response = await DELETE(new Request("http://localhost"), routeParams());
    expect(response.status).toBe(404);
  });

  it("revokes the member (never deletes the row), writes an audit log, and returns 200 — even one with an already-wrapped key share", async () => {
    const revoked = makeMember({ inviteStatus: "revoked" });
    fakeRepository.revokeMember = vi.fn().mockResolvedValue(revoked);

    const response = await DELETE(new Request("http://localhost"), routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.member.inviteStatus).toBe("revoked");
    // The row and its (now-orphaned, previously-distributed) key share still
    // exist — revocation cannot retroactively unwrap what a member already has.
    expect(body.member.hasWrappedVaultKey).toBe(true);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "member_revoked", targetId: "member-1" }),
    );
  });
});
