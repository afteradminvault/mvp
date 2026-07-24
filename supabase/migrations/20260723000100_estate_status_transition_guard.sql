-- Closes a gap in the original estates_update_owner RLS policy
-- (20260719120100_rls_policies.sql): it allows the owner to update *any*
-- column on their own estate, including status, with no restriction on
-- which transitions are valid. Since RLS is row-level, not column-level,
-- it can't itself express "status may only change through a reviewed
-- transition function" — a raw REST PATCH from an authenticated owner's
-- own session could otherwise jump straight to active_executor, skipping
-- the death-certificate gate entirely (Security Architecture §4.1: "there
-- is no route to active_executor that skips the death-certificate
-- requirement"). This is the false-positive-sensitive workflow this
-- feature is about, so closing this now rather than after §4.1's
-- transition functions exist.
--
-- Mechanism: a BEFORE UPDATE trigger rejects any status change unless a
-- transaction-local flag has been set by one of the reviewed transition
-- functions. The flag (set via set_config(..., is_local => true)) resets
-- automatically at transaction end regardless of connection pooling, and
-- works uniformly whether the calling function is SECURITY DEFINER
-- (report_death, which must bypass the caller's own lack of UPDATE rights)
-- or not (self_cancel, mark_overdue_estates, escalate_lapsed_verifications,
-- escalate_overdue_to_verifying, which all rely on the caller's own
-- RLS-granted rights or run as the service role, which bypasses RLS but
-- not triggers).
create function guard_estate_status_transition() returns trigger as $$
begin
  if new.status is distinct from old.status
     and coalesce(current_setting('aftervault.estate_status_transition_authorized', true), '') <> 'true' then
    raise exception 'estate status must only change via report_death(), self_cancel(), or the dead-man''s-switch sweep functions, not a direct update';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger estates_guard_status_transition
  before update on estates
  for each row execute function guard_estate_status_transition();

-- Retrofit: mark_overdue_estates() (Milestone 2 feature 2,
-- 20260722010000_mark_overdue_estates.sql) predates this trigger and would
-- otherwise be blocked by it. Multi-statement SQL functions execute each
-- statement in order and return only the last one's result, so prepending
-- the set_config call is sufficient — the function body is otherwise
-- unchanged.
create or replace function mark_overdue_estates()
returns setof estates
language sql
as $$
  select set_config('aftervault.estate_status_transition_authorized', 'true', true);
  with overdue as (
    update estates
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
      'estates',
      id,
      jsonb_build_object('last_check_in_at', last_check_in_at, 'check_in_interval_days', check_in_interval_days)
    from overdue
    returning 1
  )
  select * from overdue;
$$;
