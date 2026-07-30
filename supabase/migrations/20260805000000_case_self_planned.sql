-- Will Builder epic — foundational schema change confirmed with the user
-- via AskUserQuestion before any of the will-specific tables were built.
--
-- Every existing Case requires a deceased_full_name + deceased_relationship
-- describing someone OTHER than the account holder (see create-case-form.tsx's
-- own copy: "Their full name" / "Your relationship to them") — the whole
-- product today is framed as "a Family member organizes someone else's
-- affairs," even in the pre-death planning flow. A self-authored will needs
-- the opposite: a case where the account holder IS the person the case is
-- about, so that executor nomination (case_members, which already has
-- fallback_order — literally primary/alternate ordering) and digital-asset
-- bequests (digital_assets/beneficiaries, both case-scoped) can reference
-- real data instead of being re-entered as free text in the will itself.
--
-- is_self_planned is a plain boolean, not inferred from deceased_relationship
-- (e.g. checking for the string 'self') — a case where a Family member is
-- helping a still-living parent plan ahead is a real, different scenario
-- (status can be 'active_living'/'draft' in both cases) that must NOT be
-- treated as self-planned, since only the account holder can be the
-- testator of a will (signing capacity requires it).
alter table cases add column is_self_planned boolean not null default false;

create or replace function create_draft_case(
  p_jurisdiction_id uuid,
  p_deceased_full_name text,
  p_deceased_date_of_birth date,
  p_deceased_relationship text,
  p_deceased_date_of_death date default null,
  p_check_in_interval_days int default 90,
  p_is_self_planned boolean default false
) returns cases as $$
declare
  v_case cases;
begin
  if auth.uid() is null then
    raise exception 'must be authenticated to create a case';
  end if;

  insert into cases (
    owner_user_id, jurisdiction_id, display_name, check_in_interval_days, status,
    deceased_full_name, deceased_date_of_birth, deceased_relationship, deceased_date_of_death,
    is_self_planned
  )
  values (
    auth.uid(), p_jurisdiction_id, p_deceased_full_name || '''s Case', p_check_in_interval_days, 'draft',
    p_deceased_full_name, p_deceased_date_of_birth, p_deceased_relationship, p_deceased_date_of_death,
    p_is_self_planned
  )
  returning * into v_case;

  insert into case_members (case_id, user_id, role, invite_email, invite_status, accepted_at)
  select v_case.id, auth.uid(), 'family', u.email, 'accepted', now()
  from users u where u.id = auth.uid();

  return v_case;
end;
$$ language plpgsql security definer set search_path = public;

notify pgrst, 'reload schema';
