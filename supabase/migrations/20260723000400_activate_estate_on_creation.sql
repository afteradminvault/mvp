-- Fixes a gap surfaced while building Milestone 2 feature 3: create_estate()
-- (20260719120100_rls_policies.sql) never set status explicitly, so every
-- estate took the column default 'setup' and nothing anywhere ever advanced
-- it — no estate could ever reach active_living, so report_death() and the
-- entire dead-man's-switch pipeline (feature 2's cron sweep included) had no
-- path in for any real estate. last_check_in_at already defaults to now()
-- at creation, which only makes sense if the check-in clock is meant to
-- start immediately — so the fix is having creation land directly in
-- active_living rather than adding a separate, not-yet-designed activation
-- step.
--
-- No set_config authorization flag needed here: the guard trigger
-- (20260723000100_estate_status_transition_guard.sql) only fires on
-- UPDATE, and this sets status via the initial INSERT.
create or replace function create_estate(
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

  insert into estates (owner_user_id, jurisdiction_id, display_name, check_in_interval_days, status)
  values (auth.uid(), p_jurisdiction_id, p_display_name, p_check_in_interval_days, 'active_living')
  returning * into v_estate;

  insert into estate_members (estate_id, user_id, role, invite_email, invite_status, accepted_at)
  select v_estate.id, auth.uid(), 'owner', u.email, 'accepted', now()
  from users u where u.id = auth.uid();

  return v_estate;
end;
$$ language plpgsql security definer set search_path = public;
