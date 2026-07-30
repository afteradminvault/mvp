-- PRD v2 / Milestone 3 feature 4 (Executor Portal & Verification [LOCK]) 🔒
-- US-4.1 (invite) and most of US-4.2's *storage mechanism* already exist —
-- invite_member()/accept_invite() (case_member_role_and_rls.sql) already
-- do single-use, 14-day-expiring, role=executor invites, and the
-- `documents` storage bucket + its RLS (any accepted family/executor case
-- member may insert/read within their own case's folder) already covers
-- "encrypted-at-rest, not the zero-knowledge vault" for the ID upload.
-- What's net-new here is the verification *workflow itself*: a status
-- funnel (pending -> id_uploaded -> terms_accepted -> family_approved ->
-- fully_verified, or declined) tracked per executor, gated behind
-- SECURITY DEFINER RPCs the same way membership mutations are.
--
-- Judgment call (not in the spreadsheet's column list, flagged rather than
-- silently added): a `declined` status plus family_declined_at/by columns.
-- Without it, a Family decline would be a pure no-op — the AC explicitly
-- says decline must not be "a silent dead end", so leaving status exactly
-- where it was wouldn't satisfy that. Declining is not treated as a
-- terminal ban (case_members.invite_status is untouched, so unlike
-- revoke_member() this can't lock the executor out of the case entirely)
-- — Family can decide again later, e.g. after a conversation off-app.
--
-- Confirmed with the user (AskUserQuestion, "Verification gate" ->
-- "Yes, enforce it"): wrap_key_share_for_member() below is amended to
-- require status = 'fully_verified' for that member first — the epic's
-- own framing ("before I'm trusted with vault access") is treated as a
-- real requirement, not just a UI-only status tracker.

-- ---------------------------------------------------------------------------
-- 1. Status enum + table
-- ---------------------------------------------------------------------------

create type executor_verification_status as enum (
  'pending',
  'id_uploaded',
  'terms_accepted',
  'family_approved',
  'fully_verified',
  'declined'
);

create table executor_verifications (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  member_id uuid not null unique references case_members(id) on delete cascade,
  status executor_verification_status not null default 'pending',
  id_document_storage_path text,
  legal_terms_accepted_at timestamptz,
  family_approved_at timestamptz,
  family_approved_by_user_id uuid references users(id),
  family_declined_at timestamptz,
  family_declined_by_user_id uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index executor_verifications_case_id_idx on executor_verifications(case_id);

create trigger executor_verifications_set_updated_at
  before update on executor_verifications
  for each row execute function set_updated_at();

alter table executor_verifications enable row level security;

-- Read-only via RLS for any accepted case member (the executor needs to see
-- their own progress per US-4.5; Family needs to see it to decide per
-- US-4.4) — every write goes through the RPCs below, security-definer,
-- same shape as case_members having no direct insert/update policy either.
create policy executor_verifications_select_member on executor_verifications for select
  using (is_case_member(case_id));

-- ---------------------------------------------------------------------------
-- 2. Status derivation, shared by every mutating RPC below. `declined`
--    takes priority over everything else (even if id/terms were already
--    done) since it's the one state that must never be silently masked by
--    an otherwise-complete funnel.
-- ---------------------------------------------------------------------------

create function compute_executor_verification_status(
  p_id_document_storage_path text,
  p_legal_terms_accepted_at timestamptz,
  p_family_approved_at timestamptz,
  p_family_declined_at timestamptz
) returns executor_verification_status as $$
  select case
    when p_family_declined_at is not null then 'declined'::executor_verification_status
    when p_id_document_storage_path is not null
      and p_legal_terms_accepted_at is not null
      and p_family_approved_at is not null then 'fully_verified'::executor_verification_status
    when p_family_approved_at is not null then 'family_approved'::executor_verification_status
    when p_legal_terms_accepted_at is not null then 'terms_accepted'::executor_verification_status
    when p_id_document_storage_path is not null then 'id_uploaded'::executor_verification_status
    else 'pending'::executor_verification_status
  end;
$$ language sql immutable;

-- ---------------------------------------------------------------------------
-- 3. accept_invite() amended to open a verification row the moment an
--    executor invite is accepted ("before I'm trusted with vault access"
--    starts counting from here, not from first upload).
-- ---------------------------------------------------------------------------

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

  if v_member.role = 'executor' then
    insert into executor_verifications (case_id, member_id)
    values (v_member.case_id, v_member.id)
    on conflict (member_id) do nothing;
  end if;

  return v_member;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- 4. Verification-workflow RPCs (US-4.2, US-4.3, US-4.4). Each is callable
--    only by the executor themselves (upload/accept-terms) or a family-role
--    member (decide), mirroring is_case_member()'s existing role-array
--    pattern from the membership RPCs.
-- ---------------------------------------------------------------------------

create function upload_executor_id_document(
  p_case_id uuid,
  p_member_id uuid,
  p_storage_path text
) returns executor_verifications as $$
declare
  v_member case_members;
  v_row executor_verifications;
begin
  select * into v_member from case_members
    where id = p_member_id and case_id = p_case_id and invite_status = 'accepted';
  if not found or v_member.role <> 'executor' or v_member.user_id <> auth.uid() then
    raise exception 'only the nominated executor may upload their own verification id';
  end if;

  update executor_verifications
    set id_document_storage_path = p_storage_path,
        status = compute_executor_verification_status(
          p_storage_path, legal_terms_accepted_at, family_approved_at, family_declined_at
        )
    where member_id = p_member_id
    returning * into v_row;
  if not found then
    raise exception 'executor verification record not found';
  end if;

  return v_row;
end;
$$ language plpgsql security definer set search_path = public;

create function accept_executor_legal_terms(
  p_case_id uuid,
  p_member_id uuid
) returns executor_verifications as $$
declare
  v_member case_members;
  v_row executor_verifications;
begin
  select * into v_member from case_members
    where id = p_member_id and case_id = p_case_id and invite_status = 'accepted';
  if not found or v_member.role <> 'executor' or v_member.user_id <> auth.uid() then
    raise exception 'only the nominated executor may accept their own legal terms';
  end if;

  update executor_verifications
    set legal_terms_accepted_at = now(),
        status = compute_executor_verification_status(
          id_document_storage_path, now(), family_approved_at, family_declined_at
        )
    where member_id = p_member_id
    returning * into v_row;
  if not found then
    raise exception 'executor verification record not found';
  end if;

  return v_row;
end;
$$ language plpgsql security definer set search_path = public;

create function decide_executor_verification(
  p_case_id uuid,
  p_member_id uuid,
  p_approved boolean
) returns executor_verifications as $$
declare
  v_row executor_verifications;
begin
  if not is_case_member(p_case_id, array['family']::case_member_role[]) then
    raise exception 'only a family member can decide an executor verification';
  end if;

  if p_approved then
    update executor_verifications
      set family_approved_at = now(),
          family_approved_by_user_id = auth.uid(),
          family_declined_at = null,
          family_declined_by_user_id = null,
          status = compute_executor_verification_status(
            id_document_storage_path, legal_terms_accepted_at, now(), null
          )
      where member_id = p_member_id and case_id = p_case_id
      returning * into v_row;
  else
    update executor_verifications
      set family_declined_at = now(),
          family_declined_by_user_id = auth.uid(),
          family_approved_at = null,
          family_approved_by_user_id = null,
          status = 'declined'
      where member_id = p_member_id and case_id = p_case_id
      returning * into v_row;
  end if;
  if not found then
    raise exception 'executor verification record not found';
  end if;

  return v_row;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- 5. The verification gate itself: wrap_key_share_for_member() now refuses
--    to hand over a vault-key share until that executor is fully_verified.
-- ---------------------------------------------------------------------------

create or replace function wrap_key_share_for_member(
  p_case_id uuid,
  p_member_id uuid,
  p_sealed_vault_key bytea
) returns case_members as $$
declare
  v_member case_members;
  v_verification_status executor_verification_status;
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

  if v_member.role = 'executor' then
    select status into v_verification_status from executor_verifications where member_id = p_member_id;
    if v_verification_status is distinct from 'fully_verified' then
      raise exception 'this executor has not completed verification yet';
    end if;
  end if;

  update case_members set wrapped_vault_key = p_sealed_vault_key
    where id = v_member.id
    returning * into v_member;

  return v_member;
end;
$$ language plpgsql security definer set search_path = public;

notify pgrst, 'reload schema';
