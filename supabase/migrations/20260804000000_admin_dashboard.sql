-- PRD v2 / Milestone 7 (Admin Dashboard), US-8.1-US-8.4, US-8.6-US-8.7.
-- US-8.5 (Manual Subscription Management) is deliberately NOT included —
-- there is no subscriptions table anywhere in this schema (Milestone 6
-- billing was explicitly deferred by the user before this milestone
-- started), so there is nothing to manually adjust yet. US-8.1's MRR/
-- churn/subscriptions metrics are omitted for the same reason — the admin
-- overview endpoint returns the four metrics that ARE meaningful today
-- (users, active cases, accounts closed, vault items).
--
-- Consistent RLS approach throughout: add a narrow is_platform_admin()
-- SELECT/UPDATE policy alongside each table's existing policies (same OR
-- pattern as providers_admin_write/legal_requirements_admin_write) rather
-- than routing admin reads through the service-role client — keeps
-- authorization visible at the RLS layer instead of scattered through
-- application code, matching this codebase's stated preference elsewhere
-- for the caller's own session over service role wherever RLS can express
-- it. The one deliberate exception is get_admin_overview_metrics() below.

-- ---------------------------------------------------------------------------
-- 1. US-8.2 — user suspension + impersonation session log
-- ---------------------------------------------------------------------------

alter table users add column suspended_at timestamptz null;

create policy users_select_admin on users for select using (is_platform_admin());
create policy users_update_admin on users for update
  using (is_platform_admin()) with check (is_platform_admin());

-- Every impersonation session writes its own row here (US-8.2's own AC),
-- in addition to the standard audit_logs entry the admin route also
-- writes. No RLS policies at all — same reasoning as platform_admins:
-- creating an impersonation session requires the Supabase Admin API
-- (auth.admin.generateLink), which is only reachable via the service-role
-- client anyway, so there is no session-client access pattern to gate.
create table admin_impersonation_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references users(id),
  target_user_id uuid not null references users(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz null
);
alter table admin_impersonation_sessions enable row level security;

-- ---------------------------------------------------------------------------
-- 2. US-8.3 — Case oversight & flagging
-- ---------------------------------------------------------------------------

alter table cases add column flagged boolean not null default false;
alter table cases add column flagged_notes text null;

create policy cases_select_admin on cases for select using (is_platform_admin());
create policy cases_update_admin on cases for update
  using (is_platform_admin()) with check (is_platform_admin());

-- ---------------------------------------------------------------------------
-- 3. US-8.4 — Platform database management: retire via is_active, not a
--    hard delete (the story's own AC) — preserves legal_requirements
--    history and asset records that reference a retired provider.
-- ---------------------------------------------------------------------------

alter table providers add column is_active boolean not null default true;

-- ---------------------------------------------------------------------------
-- 4. US-8.6 — Support queue (inbound email)
-- ---------------------------------------------------------------------------

create type support_ticket_status as enum ('open', 'in_progress', 'resolved', 'closed');

create table support_tickets (
  id uuid primary key default gen_random_uuid(),
  from_email citext not null,
  subject text not null,
  body text not null,
  status support_ticket_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger support_tickets_set_updated_at
  before update on support_tickets
  for each row execute function set_updated_at();

alter table support_tickets enable row level security;
-- Admin browsing/updating the queue uses the admin's own session (RLS-gated,
-- same as providers_admin_write). The inbound-email webhook itself has no
-- admin session to authenticate as — that route uses the service-role
-- client directly (bypasses RLS, same as the cron sweep functions).
create policy support_tickets_admin_all on support_tickets for all
  using (is_platform_admin()) with check (is_platform_admin());

-- ---------------------------------------------------------------------------
-- 5. US-8.7 — System-wide audit logs (distinct from the per-case viewer,
--    which already exists) — one additional OR'd SELECT policy, same
--    pattern as every other admin-visibility addition above.
-- ---------------------------------------------------------------------------

create policy audit_logs_select_admin on audit_logs for select using (is_platform_admin());

-- ---------------------------------------------------------------------------
-- 6. US-8.1 — overview metrics. A SECURITY DEFINER function rather than
--    plain RLS+SELECT: digital_vault_items and account_closure_requests
--    are per-case-scoped tables with no admin visibility anywhere else in
--    this schema, and the story's own AC is explicit ("aggregate counts
--    only — no plaintext, no per-user drill-down from this screen"). A
--    function whose return type is 4 integers structurally cannot leak a
--    row, which is a stronger guarantee than "trust the client to only
--    ever SELECT count(*)" against a row-visible table.
-- ---------------------------------------------------------------------------

create function get_admin_overview_metrics()
returns table (
  user_count bigint,
  active_case_count bigint,
  accounts_closed_count bigint,
  vault_item_count bigint
) as $$
begin
  if not is_platform_admin() then
    raise exception 'platform admin access required';
  end if;

  return query select
    (select count(*) from users where deleted_at is null),
    (select count(*) from cases where status <> 'closed'),
    (select count(*) from account_closure_requests where status = 'resolved'),
    (select count(*) from digital_vault_items);
end;
$$ language plpgsql security definer set search_path = public;

notify pgrst, 'reload schema';
