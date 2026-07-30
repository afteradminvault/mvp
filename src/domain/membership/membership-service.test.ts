import { describe, expect, it, vi } from "vitest";
import type { EstateMember, MembershipRepository } from "./ports";
import {
  InvalidMembershipInputError,
  InviteInvalidOrExpiredError,
  MembershipForbiddenError,
  MembershipNotFoundError,
  MembershipService,
} from "./membership-service";

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
    inviteToken: null,
    ...overrides,
  };
}

describe("MembershipService.inviteMember", () => {
  it("invites a member with a valid email and role", async () => {
    const member = makeMember();
    const repository = createFakeRepository({ inviteMember: vi.fn().mockResolvedValue(member) });
    const service = new MembershipService(repository);

    const result = await service.inviteMember("estate-1", { inviteEmail: "marcus@example.com", role: "executor" });

    expect(repository.inviteMember).toHaveBeenCalledWith("estate-1", {
      inviteEmail: "marcus@example.com",
      role: "executor",
      fallbackOrder: undefined,
    });
    expect(result).toBe(member);
  });

  it("rejects an invalid email", async () => {
    const repository = createFakeRepository();
    const service = new MembershipService(repository);

    await expect(
      service.inviteMember("estate-1", { inviteEmail: "not-an-email", role: "executor" }),
    ).rejects.toThrow(InvalidMembershipInputError);
    expect(repository.inviteMember).not.toHaveBeenCalled();
  });

  it("rejects an invalid role", async () => {
    const repository = createFakeRepository();
    const service = new MembershipService(repository);

    await expect(
      service.inviteMember("estate-1", { inviteEmail: "marcus@example.com", role: "owner" as never }),
    ).rejects.toThrow(InvalidMembershipInputError);
  });

  it("rejects a non-positive fallbackOrder", async () => {
    const repository = createFakeRepository();
    const service = new MembershipService(repository);

    await expect(
      service.inviteMember("estate-1", { inviteEmail: "marcus@example.com", role: "executor", fallbackOrder: 0 }),
    ).rejects.toThrow(InvalidMembershipInputError);
  });

  it("translates a repository forbidden error", async () => {
    const repository = createFakeRepository({
      inviteMember: vi.fn().mockRejectedValue(new Error("only the case owner can invite members")),
    });
    const service = new MembershipService(repository);

    await expect(
      service.inviteMember("estate-1", { inviteEmail: "marcus@example.com", role: "executor" }),
    ).rejects.toThrow(MembershipForbiddenError);
  });
});

describe("MembershipService.getInvitePreview", () => {
  it("returns the preview for a valid token", async () => {
    const preview = { estateDisplayName: "Diane's Estate", role: "executor" as const, valid: true };
    const repository = createFakeRepository({ getInvitePreview: vi.fn().mockResolvedValue(preview) });
    const service = new MembershipService(repository);

    await expect(service.getInvitePreview("some-token")).resolves.toBe(preview);
  });

  it("rejects a missing token", async () => {
    const repository = createFakeRepository();
    const service = new MembershipService(repository);

    await expect(service.getInvitePreview("")).rejects.toThrow(InvalidMembershipInputError);
    expect(repository.getInvitePreview).not.toHaveBeenCalled();
  });
});

describe("MembershipService.acceptInvite", () => {
  it("accepts an invite with well-formed hex fields", async () => {
    const member = makeMember({ inviteStatus: "accepted" });
    const repository = createFakeRepository({ acceptInvite: vi.fn().mockResolvedValue(member) });
    const service = new MembershipService(repository);

    const result = await service.acceptInvite("some-token", {
      publicKey: "aabbcc",
      wrappedPrivateKey: "112233",
      kdfSalt: "445566",
    });

    expect(repository.acceptInvite).toHaveBeenCalledWith("some-token", {
      publicKey: "aabbcc",
      wrappedPrivateKey: "112233",
      kdfSalt: "445566",
    });
    expect(result).toBe(member);
  });

  it.each(["publicKey", "wrappedPrivateKey", "kdfSalt"] as const)("rejects a missing %s", async (field) => {
    const repository = createFakeRepository();
    const service = new MembershipService(repository);
    const base = { publicKey: "aabbcc", wrappedPrivateKey: "112233", kdfSalt: "445566" };

    await expect(service.acceptInvite("some-token", { ...base, [field]: "" })).rejects.toThrow(
      InvalidMembershipInputError,
    );
  });

  it("translates a repository 'invite not found or already used' error", async () => {
    const repository = createFakeRepository({
      acceptInvite: vi.fn().mockRejectedValue(new Error("invite not found or already used")),
    });
    const service = new MembershipService(repository);

    await expect(
      service.acceptInvite("some-token", { publicKey: "aabbcc", wrappedPrivateKey: "112233", kdfSalt: "445566" }),
    ).rejects.toThrow(InviteInvalidOrExpiredError);
  });

  it("translates a repository 'invite has expired' error", async () => {
    const repository = createFakeRepository({
      acceptInvite: vi.fn().mockRejectedValue(new Error("invite has expired")),
    });
    const service = new MembershipService(repository);

    await expect(
      service.acceptInvite("some-token", { publicKey: "aabbcc", wrappedPrivateKey: "112233", kdfSalt: "445566" }),
    ).rejects.toThrow(InviteInvalidOrExpiredError);
  });
});

describe("MembershipService.wrapKeyShareForMember", () => {
  it("wraps a key share with a well-formed hex value", async () => {
    const member = makeMember({ hasWrappedVaultKey: true });
    const repository = createFakeRepository({ wrapKeyShareForMember: vi.fn().mockResolvedValue(member) });
    const service = new MembershipService(repository);

    const result = await service.wrapKeyShareForMember("estate-1", "member-1", "aabbcc");

    expect(repository.wrapKeyShareForMember).toHaveBeenCalledWith("estate-1", "member-1", "aabbcc");
    expect(result).toBe(member);
  });

  it("rejects a non-hex sealedVaultKey", async () => {
    const repository = createFakeRepository();
    const service = new MembershipService(repository);

    await expect(service.wrapKeyShareForMember("estate-1", "member-1", "zz")).rejects.toThrow(
      InvalidMembershipInputError,
    );
  });

  it("translates a repository 'not found or not yet accepted' error", async () => {
    const repository = createFakeRepository({
      wrapKeyShareForMember: vi.fn().mockRejectedValue(new Error("member not found or not yet accepted")),
    });
    const service = new MembershipService(repository);

    await expect(service.wrapKeyShareForMember("estate-1", "member-1", "aabbcc")).rejects.toThrow(
      MembershipNotFoundError,
    );
  });

  it("translates the not-fully-verified gate (US-4 verification requirement) as forbidden", async () => {
    const repository = createFakeRepository({
      wrapKeyShareForMember: vi.fn().mockRejectedValue(new Error("this executor has not completed verification yet")),
    });
    const service = new MembershipService(repository);

    await expect(service.wrapKeyShareForMember("estate-1", "member-1", "aabbcc")).rejects.toThrow(
      MembershipForbiddenError,
    );
  });
});

describe("MembershipService.revokeMember", () => {
  it("revokes a member", async () => {
    const member = makeMember({ inviteStatus: "revoked" });
    const repository = createFakeRepository({ revokeMember: vi.fn().mockResolvedValue(member) });
    const service = new MembershipService(repository);

    await expect(service.revokeMember("estate-1", "member-1")).resolves.toBe(member);
  });

  it("translates a repository 'cannot revoke the case owner' error", async () => {
    const repository = createFakeRepository({
      revokeMember: vi.fn().mockRejectedValue(new Error("cannot revoke the case owner")),
    });
    const service = new MembershipService(repository);

    await expect(service.revokeMember("estate-1", "member-1")).rejects.toThrow(MembershipForbiddenError);
  });

  it("translates a plain 'member not found' error", async () => {
    const repository = createFakeRepository({
      revokeMember: vi.fn().mockRejectedValue(new Error("member not found")),
    });
    const service = new MembershipService(repository);

    await expect(service.revokeMember("estate-1", "member-1")).rejects.toThrow(MembershipNotFoundError);
  });
});
