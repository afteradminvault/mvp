-- PRD v2 / Milestone 0 feature 3 (Role-Based Access Control) 🔒
-- Companion to 20260730000000_rename_estates_to_cases.sql. That migration
-- only renamed tables/columns (safe, OID-tracked, transparent to existing
-- policies/functions). This one changes the role VALUE SET itself
-- (owner/executor/helper -> family/executor, per PRD v2 §2/§8 Q3's
-- confirmed default of dropping the view-only Helper role) — a genuinely
-- new enum, not a relabeling of the old one, so every RLS policy and
-- SECURITY DEFINER function that references a role literal or the
-- member_role type has to be recreated against it. PL/pgSQL function
-- bodies re-resolve identifiers against the current catalog at each call
-- (unlike a CREATE POLICY expression, which is parsed and bound once at
-- creation time), so this is not optional cleanup — those functions would
-- start raising "invalid input value for enum" once the old type is gone
-- if left untouched.
--
-- "Admin" (PRD v2 §2 — AfterVault staff, platform-wide) is deliberately
-- NOT part of this enum. It was already modeled correctly as the separate,
-- non-case-scoped platform_admins table / is_platform_admin() function
-- (20260719120100_rls_policies.sql) — nothing to change there.
--
-- Scope note: functions belonging to other, not-yet-renamed features
-- (report_death, self_cancel, the two escalate_* sweep functions,
-- activate_executor, initialize_owner_vault_key, mark_overdue_estates)
-- keep their existing names AND parameter names (still p_estate_id, etc.)
-- even though their bodies now reference cases/case_members internally —
-- this is deliberate, so their existing TypeScript callers in other
-- features need zero changes. Only the membership-domain functions
-- (invite_member, get_invite_preview, get_member_public_keys,
-- wrap_key_share_for_member, revoke_member) get their p_estate_id
-- parameter renamed to p_case_id, since membership *is* this feature and
-- its one TypeScript caller (supabase-membership-repository.ts) is being
-- updated in the same pass anyway.

-- ---------------------------------------------------------------------------
-- 1. New role enum + data migration
-- ---------------------------------------------------------------------------

create type case_member_role as enum ('family', 'executor');

alter table case_members
  alter column role type case_member_role
  using (
    case role::text
      when 'owner' then 'family'
      when 'helper' then 'family'
      when 'executor' then 'executor'
    end
  )::case_member_role;

-- Recreate the "exactly one case-creator" constraint under the new role
-- value. This preserves v1's single-VK-holder semantics unchanged (the
-- crypto design still assumes exactly one direct-VK-holder per case) —
-- PRD v2's plural "Family" concept (multiple equal-access members) is
-- NOT implemented by this migration; only the label changed. Supporting
-- genuinely plural Family membership is future work, flagged here so it
-- isn't mistaken for already having happened.
drop index estate_members_one_owner_idx;
create unique index case_members_one_owner_idx
  on case_members (case_id) where role = 'family';

-- ---------------------------------------------------------------------------
-- 2. Drop everything that depends on the old policies/function/type, in
--    dependency order: policies first (they call is_estate_member), then
--    the function, then the two other functions with member_role-typed
--    signatures (their return/param types must be dropped before the type
--    can be), then the type itself once nothing references it.
-- ---------------------------------------------------------------------------

drop policy estates_select_member on cases;
drop policy estates_update_owner on cases;
drop policy estate_members_select_fellow_members on case_members;
drop policy digital_assets_select_member on digital_assets;
drop policy digital_assets_write_owner on digital_assets;
drop policy digital_vault_items_select_owner on digital_vault_items;
drop policy digital_vault_items_select_executor_post_death on digital_vault_items;
drop policy digital_vault_items_write_owner_only on digital_vault_items;
drop policy digital_vault_items_update_owner_only on digital_vault_items;
drop policy digital_vault_items_delete_owner_only on digital_vault_items;
drop policy beneficiaries_select_member on beneficiaries;
drop policy beneficiaries_write_owner on beneficiaries;
drop policy documents_select_member on documents;
drop policy documents_write_owner_or_executor on documents;
drop policy closure_requests_select_member on account_closure_requests;
drop policy closure_requests_write_executor on account_closure_requests;
drop policy acrd_select_member on account_closure_request_documents;
drop policy acrd_write_executor on account_closure_request_documents;
drop policy audit_logs_select_owner_or_executor on audit_logs;
drop policy audit_logs_insert_self on audit_logs;
drop policy documents_storage_select_member on storage.objects;
drop policy documents_storage_insert_owner_or_executor on storage.objects;
drop policy documents_storage_delete_owner_or_executor on storage.objects;

drop function is_estate_member(uuid, member_role[]);
drop function invite_member(uuid, citext, member_role, int);
drop function get_invite_preview(uuid);

drop type member_role;

-- ---------------------------------------------------------------------------
-- 3. Recreate the membership helper under the new name/type
-- ---------------------------------------------------------------------------

create function is_case_member(p_case_id uuid, p_roles case_member_role[] default null)
returns boolean as $$
  select exists (
    select 1 from case_members cm
    where cm.case_id = p_case_id
      and cm.user_id = auth.uid()
      and cm.invite_status = 'accepted'
      and (p_roles is null or cm.role = any (p_roles))
  );
$$ language sql stable security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- 4. Recreate every RLS policy against is_case_member/case_member_role.
--    Table names below are the already-renamed `cases`/`case_members`
--    from the companion migration where applicable; every other table
--    name is unchanged.
-- ---------------------------------------------------------------------------

create policy cases_select_member on cases for select
  using (is_case_member(id));

create policy cases_update_owner on cases for update
  using (is_case_member(id, array['family']::case_member_role[]))
  with check (is_case_member(id, array['family']::case_member_role[]));

create policy case_members_select_fellow_members on case_members for select
  using (is_case_member(case_id));

create policy digital_assets_select_member on digital_assets for select
  using (is_case_member(estate_id));

create policy digital_assets_write_owner on digital_assets for all
  using (is_case_member(estate_id, array['family']::case_member_role[]))
  with check (is_case_member(estate_id, array['family']::case_member_role[]));

create policy digital_vault_items_select_owner on digital_vault_items for select
  using (
    exists (
      select 1 from digital_assets a
      where a.id = digital_vault_items.digital_asset_id
        and is_case_member(a.estate_id, array['family']::case_member_role[])
    )
  );

create policy digital_vault_items_select_executor_post_death on digital_vault_items for select
  using (
    exists (
      select 1 from digital_assets a
      join cases c on c.id = a.estate_id
      where a.id = digital_vault_items.digital_asset_id
        and c.status = 'active_executor'
        and is_case_member(a.estate_id, array['executor']::case_member_role[])
    )
  );

create policy digital_vault_items_write_owner_only on digital_vault_items for insert
  with check (
    exists (
      select 1 from digital_assets a
      where a.id = digital_vault_items.digital_asset_id
        and is_case_member(a.estate_id, array['family']::case_member_role[])
    )
  );

create policy digital_vault_items_update_owner_only on digital_vault_items for update
  using (
    exists (
      select 1 from digital_assets a
      where a.id = digital_vault_items.digital_asset_id
        and is_case_member(a.estate_id, array['family']::case_member_role[])
    )
  )
  with check (
    exists (
      select 1 from digital_assets a
      where a.id = digital_vault_items.digital_asset_id
        and is_case_member(a.estate_id, array['family']::case_member_role[])
    )
  );

create policy digital_vault_items_delete_owner_only on digital_vault_items for delete
  using (
    exists (
      select 1 from digital_assets a
      where a.id = digital_vault_items.digital_asset_id
        and is_case_member(a.estate_id, array['family']::case_member_role[])
    )
  );

create policy beneficiaries_select_member on beneficiaries for select
  using (is_case_member(estate_id));

create policy beneficiaries_write_owner on beneficiaries for all
  using (is_case_member(estate_id, array['family']::case_member_role[]))
  with check (is_case_member(estate_id, array['family']::case_member_role[]));

create policy documents_select_member on documents for select
  using (is_case_member(estate_id));

create policy documents_write_owner_or_executor on documents for all
  using (is_case_member(estate_id, array['family', 'executor']::case_member_role[]))
  with check (is_case_member(estate_id, array['family', 'executor']::case_member_role[]));

create policy closure_requests_select_member on account_closure_requests for select
  using (is_case_member(estate_id));

create policy closure_requests_write_executor on account_closure_requests for all
  using (is_case_member(estate_id, array['executor']::case_member_role[]))
  with check (is_case_member(estate_id, array['executor']::case_member_role[]));

create policy acrd_select_member on account_closure_request_documents for select
  using (
    exists (
      select 1 from account_closure_requests r
      where r.id = account_closure_request_documents.account_closure_request_id
        and is_case_member(r.estate_id)
    )
  );

create policy acrd_write_executor on account_closure_request_documents for all
  using (
    exists (
      select 1 from account_closure_requests r
      where r.id = account_closure_request_documents.account_closure_request_id
        and is_case_member(r.estate_id, array['executor']::case_member_role[])
    )
  )
  with check (
    exists (
      select 1 from account_closure_requests r
      where r.id = account_closure_request_documents.account_closure_request_id
        and is_case_member(r.estate_id, array['executor']::case_member_role[])
    )
  );

create policy audit_logs_select_owner_or_executor on audit_logs for select
  using (
    estate_id is not null
    and is_case_member(estate_id, array['family', 'executor']::case_member_role[])
  );

create policy audit_logs_insert_self on audit_logs for insert
  with check (
    actor_user_id = auth.uid()
    and (estate_id is null or is_case_member(estate_id))
  );

create policy documents_storage_select_member on storage.objects for select
  using (bucket_id = 'documents' and is_case_member((storage.foldername(name))[1]::uuid));

create policy documents_storage_insert_owner_or_executor on storage.objects for insert
  with check (
    bucket_id = 'documents'
    and is_case_member((storage.foldername(name))[1]::uuid, array['family', 'executor']::case_member_role[])
  );

create policy documents_storage_delete_owner_or_executor on storage.objects for delete
  using (
    bucket_id = 'documents'
    and is_case_member((storage.foldername(name))[1]::uuid, array['family', 'executor']::case_member_role[])
  );

-- ---------------------------------------------------------------------------
-- 5. Case creation (was create_estate) — renamed, since it's the function
--    that inserts the founding case_members row this whole feature is
--    about. Its one caller (supabase-estate-repository.ts) is updated in
--    the same pass.
-- ---------------------------------------------------------------------------

create function create_case(
  p_display_name text,
  p_jurisdiction_id uuid,
  p_check_in_interval_days int default 90
) returns cases as $$
declare
  v_case cases;
begin
  if auth.uid() is null then
    raise exception 'must be authenticated to create a case';
  end if;

  insert into cases (owner_user_id, jurisdiction_id, display_name, check_in_interval_days, status)
  values (auth.uid(), p_jurisdiction_id, p_display_name, p_check_in_interval_days, 'active_living')
  returning * into v_case;

  insert into case_members (case_id, user_id, role, invite_email, invite_status, accepted_at)
  select v_case.id, auth.uid(), 'family', u.email, 'accepted', now()
  from users u where u.id = auth.uid();

  return v_case;
end;
$$ language plpgsql security definer set search_path = public;

drop function create_estate(text, uuid, int);

-- ---------------------------------------------------------------------------
-- 6. Membership functions (invite -> accept -> wrap-key-share -> revoke),
--    p_estate_id -> p_case_id since this domain is in scope.
-- ---------------------------------------------------------------------------

create function invite_member(
  p_case_id uuid,
  p_invite_email citext,
  p_role case_member_role,
  p_fallback_order int default null
) returns case_members as $$
declare
  v_member case_members;
begin
  if p_role = 'family' then
    raise exception 'cannot invite a second family creator';
  end if;
  if not is_case_member(p_case_id, array['family']::case_member_role[]) then
    raise exception 'only the case owner can invite members';
  end if;

  insert into case_members (case_id, role, invite_email, fallback_order)
  values (p_case_id, p_role, p_invite_email, p_fallback_order)
  returning * into v_member;

  return v_member;
end;
$$ language plpgsql security definer set search_path = public;

create function get_invite_preview(p_token uuid)
returns table (case_display_name text, role case_member_role, valid boolean) as $$
  select
    c.display_name,
    cm.role,
    (cm.invite_status = 'pending' and cm.invited_at > now() - interval '14 days') as valid
  from case_members cm
  join cases c on c.id = cm.case_id
  where cm.invite_token = p_token;
$$ language sql stable security definer set search_path = public;

create or replace function accept_invite(
  p_token uuid,
  p_public_key bytea,
  p_wrapped_private_key bytea,
  p_kdf_salt bytea
) returns case_members as $$
declare
  v_member case_members;
begin
  if auth.uid() is null then
    raise exception 'must be authenticated to accept an invite';
  end if;

  select * into v_member from case_members
    where invite_token = p_token and invite_status = 'pending'
    for update;
  if not found then
    raise exception 'invite not found or already used';
  end if;
  if v_member.invited_at < now() - interval '14 days' then
    raise exception 'invite has expired';
  end if;

  update case_members
    set user_id = auth.uid(), invite_status = 'accepted', accepted_at = now()
    where id = v_member.id
    returning * into v_member;

  update users
    set public_key = p_public_key, wrapped_private_key = p_wrapped_private_key, kdf_salt = p_kdf_salt
    where id = auth.uid() and public_key is null;

  return v_member;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function get_member_public_keys(p_case_id uuid)
returns table (member_id uuid, public_key bytea) as $$
  select cm.id, u.public_key
  from case_members cm
  join users u on u.id = cm.user_id
  where cm.case_id = p_case_id
    and cm.invite_status = 'accepted'
    and u.public_key is not null
    and is_case_member(p_case_id, array['family']::case_member_role[]);
$$ language sql stable security definer set search_path = public;

create or replace function wrap_key_share_for_member(
  p_case_id uuid,
  p_member_id uuid,
  p_sealed_vault_key bytea
) returns case_members as $$
declare
  v_member case_members;
begin
  if not is_case_member(p_case_id, array['family']::case_member_role[]) then
    raise exception 'only the case owner can wrap a key share';
  end if;

  select * into v_member from case_members
    where id = p_member_id and case_id = p_case_id and invite_status = 'accepted'
    for update;
  if not found then
    raise exception 'member not found or not yet accepted';
  end if;

  update case_members set wrapped_vault_key = p_sealed_vault_key
    where id = v_member.id
    returning * into v_member;

  return v_member;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function revoke_member(p_case_id uuid, p_member_id uuid)
returns case_members as $$
declare
  v_member case_members;
begin
  if not is_case_member(p_case_id, array['family']::case_member_role[]) then
    raise exception 'only the case owner can revoke a member';
  end if;

  select * into v_member from case_members
    where id = p_member_id and case_id = p_case_id
    for update;
  if not found then
    raise exception 'member not found';
  end if;
  if v_member.role = 'family' then
    raise exception 'cannot revoke the case owner';
  end if;

  update case_members set invite_status = 'revoked'
    where id = v_member.id
    returning * into v_member;

  return v_member;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- 7. Out-of-scope-feature functions: body updates only (table/role
--    references), names and parameter names deliberately left exactly as
--    they were so their existing TypeScript callers need no changes.
-- ---------------------------------------------------------------------------

create or replace function initialize_owner_vault_key(
  p_estate_id uuid,
  p_wrapped_vault_key bytea,
  p_kdf_salt bytea default null
) returns case_members as $$
declare
  v_member case_members;
begin
  if auth.uid() is null then
    raise exception 'must be authenticated to initialize a vault key';
  end if;

  select * into v_member from case_members
    where case_id = p_estate_id and user_id = auth.uid() and role = 'family'
    for update;
  if not found then
    raise exception 'only the case owner can initialize its vault key';
  end if;
  if v_member.wrapped_vault_key is not null then
    raise exception 'vault key already initialized for this case';
  end if;

  if p_kdf_salt is not null then
    update users set kdf_salt = p_kdf_salt where id = auth.uid() and kdf_salt is null;
  end if;

  update case_members set wrapped_vault_key = p_wrapped_vault_key
    where id = v_member.id
    returning * into v_member;

  return v_member;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function mark_overdue_estates()
returns setof cases
language sql
as $$
  select set_config('aftervault.estate_status_transition_authorized', 'true', true);
  with overdue as (
    update cases
    set status = 'checkin_overdue'
    where status = 'active_living'
      and last_check_in_at <= now() - (check_in_interval_days * interval '1 day')
    returning *
  ), logged as (
    insert into audit_logs (estate_id, actor_user_id, event_type, target_table, target_id, metadata)
    select
      id,
      null,
      'checkin_overdue_detected',
      'cases',
      id,
      jsonb_build_object('last_check_in_at', last_check_in_at, 'check_in_interval_days', check_in_interval_days)
    from overdue
    returning 1
  )
  select * from overdue;
$$;

-- report_death: merging owner+helper into a single 'family' role means the
-- role column alone can no longer distinguish "the case creator" (who
-- should use self_cancel, not report_death, exactly as before) from
-- "another family member" (who legitimately can report_death, same as a
-- v1 Helper could) — both are now 'family'. Preserved explicitly via the
-- owner_user_id check below rather than silently letting the case creator
-- report their own death, which was never the intended behavior.
create or replace function report_death(p_estate_id uuid) returns cases
security definer
language plpgsql
as $$
declare
  v_role case_member_role;
  v_case cases;
begin
  if auth.uid() is null then
    raise exception 'must be authenticated to report a death';
  end if;

  select cm.role into v_role
  from case_members cm
  join cases c on c.id = cm.case_id
  where cm.case_id = p_estate_id
    and cm.user_id = auth.uid()
    and cm.invite_status = 'accepted'
    and cm.role in ('executor', 'family')
    and auth.uid() is distinct from c.owner_user_id;

  if v_role is null then
    raise exception 'only an accepted executor or other family member may report a death for this case';
  end if;

  perform set_config('aftervault.estate_status_transition_authorized', 'true', true);

  update cases
  set status = 'verifying', verification_started_at = now()
  where id = p_estate_id
    and status in ('active_living', 'checkin_overdue')
  returning * into v_case;

  if v_case.id is null then
    raise exception 'this case is not in a state that can be reported (already being verified, or not yet active)';
  end if;

  insert into audit_logs (estate_id, actor_user_id, event_type, target_table, target_id, metadata)
  values (
    p_estate_id, auth.uid(), 'death_reported', 'cases', p_estate_id,
    jsonb_build_object('source', 'proactive_report', 'reporter_role', v_role)
  );

  return v_case;
end;
$$ set search_path = public;

create or replace function self_cancel(p_estate_id uuid) returns cases
language plpgsql
as $$
declare
  v_case cases;
begin
  if auth.uid() is null then
    raise exception 'must be authenticated to self-cancel';
  end if;

  perform set_config('aftervault.estate_status_transition_authorized', 'true', true);

  update cases
  set status = 'active_living', last_check_in_at = now()
  where id = p_estate_id
    and owner_user_id = auth.uid()
    and status = 'verifying'
  returning * into v_case;

  if v_case.id is null then
    raise exception 'self-cancel is only available to the case owner while status is verifying';
  end if;

  insert into audit_logs (estate_id, actor_user_id, event_type, target_table, target_id, metadata)
  values (p_estate_id, auth.uid(), 'self_cancel_used', 'cases', p_estate_id, null);

  return v_case;
end;
$$;

create or replace function escalate_overdue_to_verifying()
returns setof cases
language sql
as $$
  select set_config('aftervault.estate_status_transition_authorized', 'true', true);
  with escalated as (
    update cases
    set status = 'verifying', verification_started_at = now()
    where status = 'checkin_overdue'
      and last_check_in_at <= now() - ((check_in_interval_days + grace_period_days) * interval '1 day')
    returning *
  ), logged_report as (
    insert into audit_logs (estate_id, actor_user_id, event_type, target_table, target_id, metadata)
    select id, null, 'death_reported', 'cases', id, jsonb_build_object('source', 'automated_escalation')
    from escalated
    returning 1
  )
  select * from escalated;
$$;

create or replace function escalate_lapsed_verifications()
returns setof cases
language sql
as $$
  select set_config('aftervault.estate_status_transition_authorized', 'true', true);
  with lapsed as (
    update cases
    set status = 'awaiting_death_certificate'
    where status = 'verifying'
      and verification_started_at <= now() - (self_cancel_window_days * interval '1 day')
    returning *
  ), logged as (
    insert into audit_logs (estate_id, actor_user_id, event_type, target_table, target_id, metadata)
    select
      id, null, 'verification_window_lapsed', 'cases', id,
      jsonb_build_object('verification_started_at', verification_started_at, 'self_cancel_window_days', self_cancel_window_days)
    from lapsed
    returning 1
  )
  select * from lapsed;
$$;

create or replace function activate_executor(p_estate_id uuid) returns cases
security definer
language plpgsql
as $$
declare
  v_case cases;
  v_has_certificate boolean;
begin
  if auth.uid() is null then
    raise exception 'must be authenticated';
  end if;

  if not is_case_member(p_estate_id, array['family', 'executor']::case_member_role[]) then
    raise exception 'only the owner or an accepted executor may activate executor access';
  end if;

  select exists (
    select 1 from documents
    where estate_id = p_estate_id and document_type = 'death_certificate'
  ) into v_has_certificate;

  if not v_has_certificate then
    raise exception 'a death certificate document must be attached before executor access can be activated';
  end if;

  perform set_config('aftervault.estate_status_transition_authorized', 'true', true);

  update cases
  set status = 'active_executor'
  where id = p_estate_id
    and status = 'awaiting_death_certificate'
  returning * into v_case;

  if v_case.id is null then
    raise exception 'this case is not awaiting a death certificate';
  end if;

  insert into audit_logs (estate_id, actor_user_id, event_type, target_table, target_id, metadata)
  values (p_estate_id, auth.uid(), 'active_executor_activated', 'cases', p_estate_id, null);

  return v_case;
end;
$$ set search_path = public;

notify pgrst, 'reload schema';
