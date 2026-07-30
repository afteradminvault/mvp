import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AdminUser,
  AdminUserListResult,
  AdminUserRepository,
  ImpersonationSession,
  ListAdminUsersFilter,
} from "@/domain/admin-users/ports";
import { createSupabaseServiceRoleClient } from "@/infrastructure/supabase/service-role-client";
import { clientEnv } from "@/config/env";

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  mfa_enabled: boolean;
  suspended_at: string | null;
  created_at: string;
}

interface ImpersonationSessionRow {
  id: string;
  admin_user_id: string;
  target_user_id: string;
  started_at: string;
  ended_at: string | null;
}

function toAdminUser(row: UserRow): AdminUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    mfaEnabled: row.mfa_enabled,
    suspendedAt: row.suspended_at,
    createdAt: row.created_at,
  };
}

/**
 * Search/suspend go through the caller's own session client (users_select_
 * admin/users_update_admin RLS, requirePlatformAdmin() already gated the
 * route). Impersonation is different: minting a real session for another
 * user requires the Supabase Admin API (auth.admin.generateLink), which
 * only the service-role key can call — no session-client equivalent
 * exists — and admin_impersonation_sessions has zero RLS policies (same
 * as platform_admins), so writing to it needs the service-role client
 * too. Both impersonation methods construct their own service-role client
 * internally rather than taking one via the constructor, keeping the
 * constructor's session-client contract consistent with every other
 * repository in this codebase.
 */
export class SupabaseAdminUserRepository implements AdminUserRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async listUsers(filter: ListAdminUsersFilter): Promise<AdminUserListResult> {
    let query = this.supabase.from("users").select("*", { count: "exact" }).is("deleted_at", null);
    if (filter.search) {
      query = query.or(`email.ilike.%${filter.search}%,display_name.ilike.%${filter.search}%`);
    }
    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(filter.offset, filter.offset + filter.limit - 1);
    if (error) throw error;
    return { users: (data as UserRow[]).map(toAdminUser), total: count ?? 0 };
  }

  async getUser(userId: string): Promise<AdminUser | null> {
    const { data, error } = await this.supabase.from("users").select("*").eq("id", userId).maybeSingle();
    if (error) throw error;
    return data ? toAdminUser(data as UserRow) : null;
  }

  async setSuspended(userId: string, suspended: boolean): Promise<AdminUser> {
    const { data, error } = await this.supabase
      .from("users")
      .update({ suspended_at: suspended ? new Date().toISOString() : null })
      .eq("id", userId)
      .select("*")
      .single();
    if (error) throw error;
    return toAdminUser(data as UserRow);
  }

  async startImpersonation(adminUserId: string, targetUserId: string): Promise<ImpersonationSession> {
    const serviceRoleClient = createSupabaseServiceRoleClient();

    const { data: targetUserRow, error: targetUserError } = await serviceRoleClient
      .from("users")
      .select("email")
      .eq("id", targetUserId)
      .single();
    if (targetUserError) throw targetUserError;

    const { data: linkData, error: linkError } = await serviceRoleClient.auth.admin.generateLink({
      type: "magiclink",
      email: (targetUserRow as { email: string }).email,
      options: { redirectTo: `${clientEnv.NEXT_PUBLIC_SITE_URL}/estates` },
    });
    if (linkError) throw linkError;

    const { data: sessionRow, error: sessionError } = await serviceRoleClient
      .from("admin_impersonation_sessions")
      .insert({ admin_user_id: adminUserId, target_user_id: targetUserId })
      .select("*")
      .single();
    if (sessionError) throw sessionError;

    const row = sessionRow as ImpersonationSessionRow;
    return {
      id: row.id,
      adminUserId: row.admin_user_id,
      targetUserId: row.target_user_id,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      actionLink: linkData.properties.action_link,
    };
  }

  async listImpersonationSessions(): Promise<Omit<ImpersonationSession, "actionLink">[]> {
    const serviceRoleClient = createSupabaseServiceRoleClient();
    const { data, error } = await serviceRoleClient
      .from("admin_impersonation_sessions")
      .select("*")
      .order("started_at", { ascending: false });
    if (error) throw error;
    return (data as ImpersonationSessionRow[]).map((row) => ({
      id: row.id,
      adminUserId: row.admin_user_id,
      targetUserId: row.target_user_id,
      startedAt: row.started_at,
      endedAt: row.ended_at,
    }));
  }

  async endImpersonation(sessionId: string): Promise<void> {
    const serviceRoleClient = createSupabaseServiceRoleClient();
    const { error } = await serviceRoleClient
      .from("admin_impersonation_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", sessionId);
    if (error) throw error;
  }
}
