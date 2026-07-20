-- AfterVault row-level security policies.
-- 🔒 Security-sensitive: this is the database-level enforcement of the
-- estate_members-based access model described in docs/SECURITY_ARCHITECTURE.md §3.2.
-- Every policy below keys off estate_members so there is exactly one place to
-- reason about "who can see/touch this estate's data."

-- ---------------------------------------------------------------------------
-- platform_admins: minimal table to make the "Admin" role concrete for RLS.
-- Not modeled as an estate_members role because admins are not estate-scoped
-- (docs/SECURITY_ARCHITECTURE.md §3.2). Membership is managed manually via the
-- Supabase dashboard/service role, not through any client-facing endpoint.
-- ---------------------------------------------------------------------------

create table platform_admins (
  user_id uuid primary key references users (id) on delete cascade,
  granted_at timestamptz not null default now()
);

alter table platform_admins enable row level security;
-- No policies at all: only the service role (which bypasses RLS) can read/write
-- this table. It must never be reachable via the anon/authenticated API surface.

create function is_platform_admin() returns boolean as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$ language sql stable security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- Helper: is the current user an accepted member of an estate, optionally
-- restricted to a specific role?
-- ---------------------------------------------------------------------------

create function is_estate_member(p_estate_id uuid, p_roles member_role[] default null)
returns boolean as $$
  select exists (
    select 1 from estate_members em
    where em.estate_id = p_estate_id
      and em.user_id = auth.uid()
      and em.invite_status = 'accepted'
      and (p_roles is null or em.role = any (p_roles))
  );
$$ language sql stable security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- Estate creation: SECURITY DEFINER function bootstraps estate + owner
-- membership atomically, so RLS never has to allow a bare INSERT into
-- estates or estate_members for arbitrary rows.
-- ---------------------------------------------------------------------------

create function create_estate(
  p_display_name text,
  p_jurisdiction_id uuid,
  p_check_in_interval_days int default 90
) returns estates as $$
declare
  v_estate estates;
begin
  if auth.uid() is null then
    raise exception 'must be authenticated to create an estate';
  end if;

  insert into estates (owner_user_id, jurisdiction_id, display_name, check_in_interval_days)
  values (auth.uid(), p_jurisdiction_id, p_display_name, p_check_in_interval_days)
  returning * into v_estate;

  insert into estate_members (estate_id, user_id, role, invite_email, invite_status, accepted_at)
  select v_estate.id, auth.uid(), 'owner', u.email, 'accepted', now()
  from users u where u.id = auth.uid();

  return v_estate;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------

alter table users enable row level security;

create policy users_select_own on users for select
  using (id = auth.uid());

create policy users_update_own on users for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- No INSERT/DELETE policy: rows are created only by the handle_new_auth_user
-- trigger (runs as the table owner, bypasses RLS) and soft-deleted via UPDATE.

-- ---------------------------------------------------------------------------
-- jurisdictions, providers, legal_requirements: public read, admin write
-- ---------------------------------------------------------------------------

alter table jurisdictions enable row level security;
create policy jurisdictions_select_all on jurisdictions for select using (true);
create policy jurisdictions_admin_write on jurisdictions for all
  using (is_platform_admin()) with check (is_platform_admin());

alter table providers enable row level security;
create policy providers_select_all on providers for select using (true);
create policy providers_admin_write on providers for all
  using (is_platform_admin()) with check (is_platform_admin());

alter table legal_requirements enable row level security;
create policy legal_requirements_select_all on legal_requirements for select using (true);
create policy legal_requirements_admin_write on legal_requirements for all
  using (is_platform_admin()) with check (is_platform_admin());

-- ---------------------------------------------------------------------------
-- estates
-- ---------------------------------------------------------------------------

alter table estates enable row level security;

create policy estates_select_member on estates for select
  using (is_estate_member(id));

create policy estates_update_owner on estates for update
  using (is_estate_member(id, array['owner']::member_role[]))
  with check (is_estate_member(id, array['owner']::member_role[]));

-- No INSERT policy: creation only via create_estate(). No DELETE policy:
-- estates are closed (status change), never hard-deleted by client action.

-- ---------------------------------------------------------------------------
-- estate_members  🔒
-- ---------------------------------------------------------------------------

alter table estate_members enable row level security;

create policy estate_members_select_fellow_members on estate_members for select
  using (is_estate_member(estate_id));

-- No INSERT/UPDATE/DELETE policy yet: the invite/accept/revoke flow is a
-- separate, not-yet-approved feature (Development Roadmap Milestone 1, step 5).
-- Until it exists, membership rows beyond the owner are only creatable via
-- create_estate(). This is intentionally read-only from the client's
-- perspective rather than a half-built invite policy.

-- ---------------------------------------------------------------------------
-- digital_assets
-- ---------------------------------------------------------------------------

alter table digital_assets enable row level security;

create policy digital_assets_select_member on digital_assets for select
  using (is_estate_member(estate_id));

create policy digital_assets_write_owner on digital_assets for all
  using (is_estate_member(estate_id, array['owner']::member_role[]))
  with check (is_estate_member(estate_id, array['owner']::member_role[]));

-- ---------------------------------------------------------------------------
-- digital_vault_items  🔒 zero-knowledge vault — strictest policy in the system
-- ---------------------------------------------------------------------------

alter table digital_vault_items enable row level security;

create policy digital_vault_items_select_owner on digital_vault_items for select
  using (
    exists (
      select 1 from digital_assets a
      where a.id = digital_vault_items.digital_asset_id
        and is_estate_member(a.estate_id, array['owner']::member_role[])
    )
  );

create policy digital_vault_items_select_executor_post_death on digital_vault_items for select
  using (
    exists (
      select 1 from digital_assets a
      join estates e on e.id = a.estate_id
      where a.id = digital_vault_items.digital_asset_id
        and e.status = 'active_executor'
        and is_estate_member(a.estate_id, array['executor']::member_role[])
    )
  );

create policy digital_vault_items_write_owner_only on digital_vault_items for insert
  with check (
    exists (
      select 1 from digital_assets a
      where a.id = digital_vault_items.digital_asset_id
        and is_estate_member(a.estate_id, array['owner']::member_role[])
    )
  );

create policy digital_vault_items_update_owner_only on digital_vault_items for update
  using (
    exists (
      select 1 from digital_assets a
      where a.id = digital_vault_items.digital_asset_id
        and is_estate_member(a.estate_id, array['owner']::member_role[])
    )
  )
  with check (
    exists (
      select 1 from digital_assets a
      where a.id = digital_vault_items.digital_asset_id
        and is_estate_member(a.estate_id, array['owner']::member_role[])
    )
  );

create policy digital_vault_items_delete_owner_only on digital_vault_items for delete
  using (
    exists (
      select 1 from digital_assets a
      where a.id = digital_vault_items.digital_asset_id
        and is_estate_member(a.estate_id, array['owner']::member_role[])
    )
  );

-- Executor never gets INSERT/UPDATE/DELETE — read-only, and only post-death.

-- ---------------------------------------------------------------------------
-- beneficiaries
-- ---------------------------------------------------------------------------

alter table beneficiaries enable row level security;

create policy beneficiaries_select_member on beneficiaries for select
  using (is_estate_member(estate_id));

create policy beneficiaries_write_owner on beneficiaries for all
  using (is_estate_member(estate_id, array['owner']::member_role[]))
  with check (is_estate_member(estate_id, array['owner']::member_role[]));

-- ---------------------------------------------------------------------------
-- documents
-- ---------------------------------------------------------------------------

alter table documents enable row level security;

create policy documents_select_member on documents for select
  using (is_estate_member(estate_id));

create policy documents_write_owner_or_executor on documents for all
  using (is_estate_member(estate_id, array['owner', 'executor']::member_role[]))
  with check (is_estate_member(estate_id, array['owner', 'executor']::member_role[]));

-- ---------------------------------------------------------------------------
-- account_closure_requests
-- ---------------------------------------------------------------------------

alter table account_closure_requests enable row level security;

create policy closure_requests_select_member on account_closure_requests for select
  using (is_estate_member(estate_id));

create policy closure_requests_write_executor on account_closure_requests for all
  using (is_estate_member(estate_id, array['executor']::member_role[]))
  with check (is_estate_member(estate_id, array['executor']::member_role[]));

-- ---------------------------------------------------------------------------
-- account_closure_request_documents
-- ---------------------------------------------------------------------------

alter table account_closure_request_documents enable row level security;

create policy acrd_select_member on account_closure_request_documents for select
  using (
    exists (
      select 1 from account_closure_requests r
      where r.id = account_closure_request_documents.account_closure_request_id
        and is_estate_member(r.estate_id)
    )
  );

create policy acrd_write_executor on account_closure_request_documents for all
  using (
    exists (
      select 1 from account_closure_requests r
      where r.id = account_closure_request_documents.account_closure_request_id
        and is_estate_member(r.estate_id, array['executor']::member_role[])
    )
  )
  with check (
    exists (
      select 1 from account_closure_requests r
      where r.id = account_closure_request_documents.account_closure_request_id
        and is_estate_member(r.estate_id, array['executor']::member_role[])
    )
  );

-- ---------------------------------------------------------------------------
-- audit_logs  🔒 append-only at the grant level, not just via missing policies
-- ---------------------------------------------------------------------------

alter table audit_logs enable row level security;

create policy audit_logs_select_owner_or_executor on audit_logs for select
  using (
    estate_id is not null
    and is_estate_member(estate_id, array['owner', 'executor']::member_role[])
  );

-- A client can only log events attributed to itself (never null/forged-system,
-- that path is reserved for the service role, which bypasses RLS entirely),
-- and only for an estate it's actually a member of, so audit rows can't be
-- forged for someone else's estate. estate_id null is allowed for
-- account-level events (e.g. login) that aren't tied to any estate.
create policy audit_logs_insert_self on audit_logs for insert
  with check (
    actor_user_id = auth.uid()
    and (estate_id is null or is_estate_member(estate_id))
  );

revoke update, delete on audit_logs from authenticated;

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------

alter table notifications enable row level security;

create policy notifications_select_own on notifications for select
  using (user_id = auth.uid());

create policy notifications_update_own on notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- No client INSERT policy: notifications are created server-side (service role).

-- ---------------------------------------------------------------------------
-- subscriptions & payments: read-only for the owning user, writes via
-- service-role webhook handler only (bypasses RLS by design).
-- ---------------------------------------------------------------------------

alter table subscriptions enable row level security;

create policy subscriptions_select_own on subscriptions for select
  using (user_id = auth.uid());

alter table payments enable row level security;

create policy payments_select_own on payments for select
  using (
    exists (
      select 1 from subscriptions s
      where s.id = payments.subscription_id and s.user_id = auth.uid()
    )
  );
