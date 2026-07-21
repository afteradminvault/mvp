-- Milestone 1 feature 5 (nomination/invite flow) 🔒
-- estate_members has no general write policy (Milestone 0 design — every
-- mutation is a narrow SECURITY DEFINER function, see create_estate() in
-- 20260719120100_rls_policies.sql). This adds the six functions the
-- invite -> accept -> wrap-key-share -> revoke flow needs.

-- ---------------------------------------------------------------------------
-- 1. Invite: Owner only. No email is sent here (Milestone 1 feature 6,
--    Resend template, is separate) — this just creates the pending row and
--    its token; the response includes a shareable link for now.
-- ---------------------------------------------------------------------------
create function invite_member(
  p_estate_id uuid,
  p_invite_email citext,
  p_role member_role,
  p_fallback_order int default null
) returns estate_members as $$
declare
  v_member estate_members;
begin
  if p_role = 'owner' then
    raise exception 'cannot invite a second owner';
  end if;
  if not is_estate_member(p_estate_id, array['owner']::member_role[]) then
    raise exception 'only the estate owner can invite members';
  end if;

  insert into estate_members (estate_id, role, invite_email, fallback_order)
  values (p_estate_id, p_role, p_invite_email, p_fallback_order)
  returning * into v_member;

  return v_member;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- 2. Public invite preview: no auth required (the invitee may not have an
--    account yet — API Specification §3). Deliberately narrow: estate name
--    + role + validity only, never the full estate_members row.
-- ---------------------------------------------------------------------------
create function get_invite_preview(p_token uuid)
returns table (estate_display_name text, role member_role, valid boolean) as $$
  select
    e.display_name,
    em.role,
    (em.invite_status = 'pending' and em.invited_at > now() - interval '14 days') as valid
  from estate_members em
  join estates e on e.id = em.estate_id
  where em.invite_token = p_token;
$$ language sql stable security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- 3. Accept: Session required (invitee must be authenticated by the time
--    this is called — the endpoint itself is "public -> session on
--    completion" per API Specification §3, meaning auth happens before
--    this call, not inside it). Links user_id, flips status, and persists
--    this account's asymmetric keypair — but only once (a keypair belongs
--    to the account, not this membership, Security Architecture §1.4).
-- ---------------------------------------------------------------------------
create function accept_invite(
  p_token uuid,
  p_public_key bytea,
  p_wrapped_private_key bytea,
  p_kdf_salt bytea
) returns estate_members as $$
declare
  v_member estate_members;
begin
  if auth.uid() is null then
    raise exception 'must be authenticated to accept an invite';
  end if;

  select * into v_member from estate_members
    where invite_token = p_token and invite_status = 'pending'
    for update;
  if not found then
    raise exception 'invite not found or already used';
  end if;
  if v_member.invited_at < now() - interval '14 days' then
    raise exception 'invite has expired';
  end if;

  update estate_members
    set user_id = auth.uid(), invite_status = 'accepted', accepted_at = now()
    where id = v_member.id
    returning * into v_member;

  update users
    set public_key = p_public_key, wrapped_private_key = p_wrapped_private_key, kdf_salt = p_kdf_salt
    where id = auth.uid() and public_key is null;

  return v_member;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- 4. Member public keys: Owner only. A narrow, purpose-built read rather
--    than loosening users' RLS (users_select_own) generally — public_key
--    isn't secret, but this keeps the "no more than what's needed" shape
--    from the API spec's "not their key material" note (which is really
--    about wrapped/private key material, not the public key itself).
-- ---------------------------------------------------------------------------
create function get_member_public_keys(p_estate_id uuid)
returns table (member_id uuid, public_key bytea) as $$
  select em.id, u.public_key
  from estate_members em
  join users u on u.id = em.user_id
  where em.estate_id = p_estate_id
    and em.invite_status = 'accepted'
    and u.public_key is not null
    and is_estate_member(p_estate_id, array['owner']::member_role[]);
$$ language sql stable security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- 5. Wrap-key-share: Owner only, target must be an accepted member. The
--    Owner's client has already sealed the VK client-side — this just
--    stores the resulting opaque bytes (Security Architecture §1.1).
-- ---------------------------------------------------------------------------
create function wrap_key_share_for_member(
  p_estate_id uuid,
  p_member_id uuid,
  p_sealed_vault_key bytea
) returns estate_members as $$
declare
  v_member estate_members;
begin
  if not is_estate_member(p_estate_id, array['owner']::member_role[]) then
    raise exception 'only the estate owner can wrap a key share';
  end if;

  select * into v_member from estate_members
    where id = p_member_id and estate_id = p_estate_id and invite_status = 'accepted'
    for update;
  if not found then
    raise exception 'member not found or not yet accepted';
  end if;

  update estate_members set wrapped_vault_key = p_sealed_vault_key
    where id = v_member.id
    returning * into v_member;

  return v_member;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- 6. Revoke: Owner only. Sets invite_status = 'revoked' — never deletes
--    the row (audit history, Database Schema §2.4's "kept even after
--    acceptance" note on invite_email). Does NOT and cannot retroactively
--    invalidate a key share already distributed and unwrapped client-side
--    — a known, documented limitation (API Specification §3), surfaced to
--    the Owner in the UI, not hidden.
-- ---------------------------------------------------------------------------
create function revoke_member(p_estate_id uuid, p_member_id uuid)
returns estate_members as $$
declare
  v_member estate_members;
begin
  if not is_estate_member(p_estate_id, array['owner']::member_role[]) then
    raise exception 'only the estate owner can revoke a member';
  end if;

  select * into v_member from estate_members
    where id = p_member_id and estate_id = p_estate_id
    for update;
  if not found then
    raise exception 'member not found';
  end if;
  if v_member.role = 'owner' then
    raise exception 'cannot revoke the estate owner';
  end if;

  update estate_members set invite_status = 'revoked'
    where id = v_member.id
    returning * into v_member;

  return v_member;
end;
$$ language plpgsql security definer set search_path = public;

notify pgrst, 'reload schema';
