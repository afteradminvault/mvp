import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MembershipRepository } from "@/domain/membership/ports";
import { GET } from "./route";

vi.mock("@/infrastructure/supabase/server-client", () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({}),
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

function routeParams(token = "some-token") {
  return { params: Promise.resolve({ token }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeRepository = createFakeRepository();
});

describe("GET /api/invites/:token (public)", () => {
  it("requires no session — works with no auth at all", async () => {
    const preview = { estateDisplayName: "Diane's Estate", role: "executor" as const, valid: true };
    fakeRepository.getInvitePreview = vi.fn().mockResolvedValue(preview);

    const response = await GET(new Request("http://localhost"), routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.preview).toEqual(preview);
  });

  it("returns 410 for an invalid or expired token, without leaking which", async () => {
    fakeRepository.getInvitePreview = vi.fn().mockRejectedValue(new Error("invite not found or already used"));

    const response = await GET(new Request("http://localhost"), routeParams());
    expect(response.status).toBe(410);
  });
});
