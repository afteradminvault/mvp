import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MembershipRepository } from "@/domain/membership/ports";
import { GET } from "./route";

const requireSessionMock = vi.fn();
vi.mock("@/app/api/_lib/require-session", () => ({
  requireSession: () => requireSessionMock(),
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

function routeParams(id = "estate-1") {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeRepository = createFakeRepository();
  requireSessionMock.mockResolvedValue({ supabase: {}, userId: "user-1" });
});

describe("GET /api/estates/:id/members/keys", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });

    const response = await GET(new Request("http://localhost"), routeParams());
    expect(response.status).toBe(401);
  });

  it("returns 403 when the caller is not the estate owner", async () => {
    fakeRepository.getMemberPublicKeys = vi
      .fn()
      .mockRejectedValue(new Error("only the estate owner can access this"));

    const response = await GET(new Request("http://localhost"), routeParams());
    expect(response.status).toBe(403);
  });

  it("returns public keys for accepted members", async () => {
    const keys = [{ memberId: "member-1", publicKey: "aabbcc" }];
    fakeRepository.getMemberPublicKeys = vi.fn().mockResolvedValue(keys);

    const response = await GET(new Request("http://localhost"), routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.publicKeys).toEqual(keys);
  });
});
