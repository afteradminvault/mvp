import { describe, expect, it, vi } from "vitest";
import type { AdminUser, AdminUserRepository, ImpersonationSession } from "./ports";
import { AdminUserNotFoundError, AdminUserService, InvalidAdminUserInputError } from "./admin-user-service";

function makeUser(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: "user-1",
    email: "marcus@example.com",
    displayName: "Marcus Whitfield",
    mfaEnabled: false,
    suspendedAt: null,
    createdAt: "2026-08-04T00:00:00.000Z",
    ...overrides,
  };
}

function makeImpersonationSession(overrides: Partial<ImpersonationSession> = {}): ImpersonationSession {
  return {
    id: "session-1",
    adminUserId: "admin-1",
    targetUserId: "user-1",
    startedAt: "2026-08-04T00:00:00.000Z",
    endedAt: null,
    actionLink: "https://project.supabase.co/auth/v1/verify?token=abc&type=magiclink",
    ...overrides,
  };
}

function createFakeRepository(overrides: Partial<AdminUserRepository> = {}): AdminUserRepository {
  return {
    listUsers: vi.fn(),
    getUser: vi.fn().mockResolvedValue(makeUser()),
    setSuspended: vi.fn(),
    startImpersonation: vi.fn().mockResolvedValue(makeImpersonationSession()),
    listImpersonationSessions: vi.fn(),
    endImpersonation: vi.fn(),
    ...overrides,
  };
}

describe("AdminUserService.listUsers", () => {
  it("applies default limit/offset and trims search", async () => {
    const repository = createFakeRepository({ listUsers: vi.fn().mockResolvedValue({ users: [], total: 0 }) });
    const service = new AdminUserService(repository);

    await service.listUsers({ search: "  marcus  " });

    expect(repository.listUsers).toHaveBeenCalledWith({ search: "marcus", limit: 50, offset: 0 });
  });

  it("rejects a limit above the max", async () => {
    const repository = createFakeRepository();
    const service = new AdminUserService(repository);

    await expect(service.listUsers({ limit: "101" })).rejects.toThrow(InvalidAdminUserInputError);
  });
});

describe("AdminUserService.getUser", () => {
  it("throws AdminUserNotFoundError when not found", async () => {
    const repository = createFakeRepository({ getUser: vi.fn().mockResolvedValue(null) });
    const service = new AdminUserService(repository);

    await expect(service.getUser("nonexistent")).rejects.toThrow(AdminUserNotFoundError);
  });
});

describe("AdminUserService.setSuspended", () => {
  it("suspends a user", async () => {
    const suspended = makeUser({ suspendedAt: "2026-08-04T01:00:00.000Z" });
    const repository = createFakeRepository({ setSuspended: vi.fn().mockResolvedValue(suspended) });
    const service = new AdminUserService(repository);

    const result = await service.setSuspended("user-1", true);

    expect(repository.setSuspended).toHaveBeenCalledWith("user-1", true);
    expect(result.suspendedAt).not.toBeNull();
  });

  it("rejects a non-boolean suspended value", async () => {
    const repository = createFakeRepository();
    const service = new AdminUserService(repository);

    await expect(service.setSuspended("user-1", "yes")).rejects.toThrow(InvalidAdminUserInputError);
  });
});

describe("AdminUserService.startImpersonation — vault plaintext must stay unreachable", () => {
  it("rejects impersonating a user that doesn't exist", async () => {
    const repository = createFakeRepository({ getUser: vi.fn().mockResolvedValue(null) });
    const service = new AdminUserService(repository);

    await expect(service.startImpersonation("admin-1", "nonexistent")).rejects.toThrow(AdminUserNotFoundError);
    expect(repository.startImpersonation).not.toHaveBeenCalled();
  });

  it("returns only auth-action-link + bookkeeping fields — never a vault-key or ciphertext field", async () => {
    const repository = createFakeRepository();
    const service = new AdminUserService(repository);

    const result = await service.startImpersonation("admin-1", "user-1");

    // This is the story's own "explicit negative test": the service has no
    // dependency on any vault-item/vault-key repository at all (see its
    // constructor signature — only AdminUserRepository), so there is no
    // code path through which it could read wrapped_private_key, kdf_salt,
    // wrapped_vault_key, or digital_vault_items regardless of what the
    // underlying repository call does. This asserts the one thing that
    // actually crosses the service boundary: the returned shape.
    expect(Object.keys(result).sort()).toEqual(
      ["actionLink", "adminUserId", "endedAt", "id", "startedAt", "targetUserId"].sort(),
    );
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/wrapped_private_key|wrappedPrivateKey|kdf_salt|kdfSalt|wrapped_vault_key|wrappedVaultKey|ciphertext/i);
  });

  it("passes the admin and target user ids straight through to the repository", async () => {
    const repository = createFakeRepository();
    const service = new AdminUserService(repository);

    await service.startImpersonation("admin-1", "user-1");

    expect(repository.startImpersonation).toHaveBeenCalledWith("admin-1", "user-1");
  });
});

describe("AdminUserService.listImpersonationSessions / endImpersonation", () => {
  it("listImpersonationSessions delegates to the repository", async () => {
    const sessions = [
      { id: "session-1", adminUserId: "admin-1", targetUserId: "user-1", startedAt: "2026-08-04T00:00:00.000Z", endedAt: null },
    ];
    const repository = createFakeRepository({ listImpersonationSessions: vi.fn().mockResolvedValue(sessions) });
    const service = new AdminUserService(repository);

    await expect(service.listImpersonationSessions()).resolves.toBe(sessions);
  });

  it("endImpersonation delegates to the repository", async () => {
    const repository = createFakeRepository();
    const service = new AdminUserService(repository);

    await service.endImpersonation("session-1");

    expect(repository.endImpersonation).toHaveBeenCalledWith("session-1");
  });
});
