/**
 * Admin user-management domain contracts (Database Schema §2.11, PRD v2
 * §3.8, US-8.2). Framework-free, same rationale as the other ports.ts
 * files.
 */
export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  mfaEnabled: boolean;
  suspendedAt: string | null;
  createdAt: string;
}

export interface ListAdminUsersFilter {
  /** Matches against email or display_name. */
  search?: string;
  limit: number;
  offset: number;
}

export interface AdminUserListResult {
  users: AdminUser[];
  total: number;
}

/**
 * A real auth session for the target user (Supabase Admin API magic
 * link), not a role-flag — see the migration's own comment on
 * admin_impersonation_sessions. `actionLink` is one-time/short-lived and
 * is returned only from startImpersonation(), never persisted or
 * re-fetchable — same "never re-selected" treatment as EstateMember's
 * inviteToken.
 */
export interface ImpersonationSession {
  id: string;
  adminUserId: string;
  targetUserId: string;
  startedAt: string;
  endedAt: string | null;
  actionLink: string;
}

export interface AdminUserRepository {
  listUsers(filter: ListAdminUsersFilter): Promise<AdminUserListResult>;
  getUser(userId: string): Promise<AdminUser | null>;
  setSuspended(userId: string, suspended: boolean): Promise<AdminUser>;
  startImpersonation(adminUserId: string, targetUserId: string): Promise<ImpersonationSession>;
  listImpersonationSessions(): Promise<Omit<ImpersonationSession, "actionLink">[]>;
  endImpersonation(sessionId: string): Promise<void>;
}
