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
    hasWrappedVaultKey: true,
    createdAt: "2026-07-21T00:00:00.000Z",
    inviteToken: null,
    ...overrides,
  };
}

function routeParams(id = "estate-1", memberId = "member-1") {
  return { params: Promise.resolve({ id, memberId }) };
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/estates/estate-1/members/member-1/wrap-key-share", {
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

describe("POST /api/estates/:id/members/:memberId/wrap-key-share", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });

    const response = await POST(postRequest({ sealedVaultKey: "aabbcc" }), routeParams());
    expect(response.status).toBe(401);
    expect(fakeRepository.wrapKeyShareForMember).not.toHaveBeenCalled();
  });

  it("returns 400 when sealedVaultKey is missing", async () => {
    const response = await POST(postRequest({}), routeParams());
    expect(response.status).toBe(400);
  });

  it("returns 400 (via the real MembershipService validation) for a non-hex value", async () => {
    const response = await POST(postRequest({ sealedVaultKey: "zz" }), routeParams());
    expect(response.status).toBe(400);
    expect(fakeRepository.wrapKeyShareForMember).not.toHaveBeenCalled();
  });

  it("returns 404 when the member isn't found or hasn't accepted yet", async () => {
    fakeRepository.wrapKeyShareForMember = vi
      .fn()
      .mockRejectedValue(new Error("member not found or not yet accepted"));

    const response = await POST(postRequest({ sealedVaultKey: "aabbcc" }), routeParams());
    expect(response.status).toBe(404);
  });

  it("stores the sealed key share, writes an audit log, and returns 200", async () => {
    const member = makeMember();
    fakeRepository.wrapKeyShareForMember = vi.fn().mockResolvedValue(member);

    const response = await POST(postRequest({ sealedVaultKey: "aabbcc" }), routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.member).toEqual(member);
    expect(fakeRepository.wrapKeyShareForMember).toHaveBeenCalledWith("estate-1", "member-1", "aabbcc");
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "member_key_share_wrapped", targetId: "member-1" }),
    );
  });
});
