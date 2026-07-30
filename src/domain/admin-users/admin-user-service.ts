import type {
  AdminUser,
  AdminUserListResult,
  AdminUserRepository,
  ImpersonationSession,
  ListAdminUsersFilter,
} from "./ports";

export const DEFAULT_USER_LIMIT = 50;
export const MAX_USER_LIMIT = 100;

export class InvalidAdminUserInputError extends Error {}
export class AdminUserNotFoundError extends Error {}

function validateSearch(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new InvalidAdminUserInputError("search must be a string.");
  }
  return value.trim();
}

function validateLimit(value: unknown): number {
  if (value === undefined || value === null || value === "") return DEFAULT_USER_LIMIT;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_USER_LIMIT) {
    throw new InvalidAdminUserInputError(`limit must be an integer between 1 and ${MAX_USER_LIMIT}.`);
  }
  return parsed;
}

function validateOffset(value: unknown): number {
  if (value === undefined || value === null || value === "") return 0;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new InvalidAdminUserInputError("offset must be a non-negative integer.");
  }
  return parsed;
}

function validateSuspended(value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw new InvalidAdminUserInputError("suspended must be a boolean.");
  }
  return value;
}

/**
 * Orchestrates admin user search/suspend/impersonate (US-8.2). Real
 * authorization is entirely RLS-backed (users_select_admin/
 * users_update_admin, added alongside this feature) plus
 * requirePlatformAdmin() at the route layer for the two impersonation
 * actions, which need the service-role client (see the repository's own
 * comment) — this service only validates input.
 */
export class AdminUserService {
  constructor(private readonly repository: AdminUserRepository) {}

  async listUsers(query: { search?: unknown; limit?: unknown; offset?: unknown }): Promise<AdminUserListResult> {
    const filter: ListAdminUsersFilter = {
      search: validateSearch(query.search),
      limit: validateLimit(query.limit),
      offset: validateOffset(query.offset),
    };
    return this.repository.listUsers(filter);
  }

  async getUser(userId: string): Promise<AdminUser> {
    const user = await this.repository.getUser(userId);
    if (!user) {
      throw new AdminUserNotFoundError("User not found.");
    }
    return user;
  }

  async setSuspended(userId: string, suspended: unknown): Promise<AdminUser> {
    const validSuspended = validateSuspended(suspended);
    return this.repository.setSuspended(userId, validSuspended);
  }

  /**
   * Vault plaintext is unreachable here by construction, not by a runtime
   * check: this service has no dependency on any vault-item/vault-key
   * repository, so there is no code path through which it could read one
   * even for a bug to introduce. The returned ImpersonationSession is a
   * plain auth action link plus bookkeeping fields — nothing here ever
   * touches digital_vault_items, wrapped_private_key, kdf_salt, or
   * wrapped_vault_key (see the domain-level test asserting exactly this
   * shape, and Security Architecture §1.1: decryption is 100%
   * client-side, keyed off the account's own password, which the admin
   * never has regardless of which session is active in their browser).
   */
  async startImpersonation(adminUserId: string, targetUserId: string): Promise<ImpersonationSession> {
    const target = await this.repository.getUser(targetUserId);
    if (!target) {
      throw new AdminUserNotFoundError("User not found.");
    }
    return this.repository.startImpersonation(adminUserId, targetUserId);
  }

  async listImpersonationSessions() {
    return this.repository.listImpersonationSessions();
  }

  async endImpersonation(sessionId: string): Promise<void> {
    return this.repository.endImpersonation(sessionId);
  }
}
