-- Milestone 1 feature 4 (vault item CRUD) 🔒 — the Vault Key itself has no
-- write path yet: estate_members has no UPDATE policy (Milestone 0 design:
-- every estate_members write is a narrow SECURITY DEFINER function, not a
-- general RLS policy — see create_estate() in
-- 20260719120100_rls_policies.sql). This adds the one-time bootstrap the
-- Owner's client calls the first time they create a vault item
-- (docs/SECURITY_ARCHITECTURE.md §1.1: "Vault Key ... generated once
-- client-side when the Planner creates their first vault item").

create function initialize_owner_vault_key(
  p_estate_id uuid,
  p_wrapped_vault_key bytea,
  p_kdf_salt bytea default null
) returns estate_members as $$
declare
  v_member estate_members;
begin
  if auth.uid() is null then
    raise exception 'must be authenticated to initialize a vault key';
  end if;

  select * into v_member from estate_members
    where estate_id = p_estate_id and user_id = auth.uid() and role = 'owner'
    for update;
  if not found then
    raise exception 'only the estate owner can initialize its vault key';
  end if;
  if v_member.wrapped_vault_key is not null then
    raise exception 'vault key already initialized for this estate';
  end if;

  -- Only set kdf_salt if this account doesn't already have one — it's an
  -- account-level value (docs/SECURITY_ARCHITECTURE.md §1.4, resolved),
  -- reused for both the Owner-VK-wrap and Executor-private-key-wrap paths,
  -- so an existing Executor becoming an Owner elsewhere must not overwrite it.
  if p_kdf_salt is not null then
    update users set kdf_salt = p_kdf_salt where id = auth.uid() and kdf_salt is null;
  end if;

  update estate_members set wrapped_vault_key = p_wrapped_vault_key
    where id = v_member.id
    returning * into v_member;

  return v_member;
end;
$$ language plpgsql security definer set search_path = public;
