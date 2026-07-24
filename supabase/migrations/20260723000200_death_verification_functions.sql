-- Milestone 2 feature 3: death reporting + verification workflow
-- (Security Architecture §4.1/§4.2). Four transition functions, all
-- authorized to write through the guard trigger added in
-- 20260723000100_estate_status_transition_guard.sql via set_config.
--
-- death_reported is written only as an audit_logs event_type, never
-- persisted as a resting estates.status value: §4.2 says the notice fires
-- "on entering verifying," never mentions a death_reported-stage notice,
-- and nothing else reads or acts on an at-rest death_reported row. Both
-- entry points below (report_death, escalate_overdue_to_verifying)
-- transition status directly active_living/checkin_overdue -> verifying in
-- one step, logging a death_reported event on the way with metadata
-- distinguishing the source.

-- ---------------------------------------------------------------------------
-- report_death: proactive report by a nominated executor/helper.
-- SECURITY DEFINER because estates_update_owner (RLS) grants UPDATE only to
-- the owner — an executor/helper legitimately has no direct UPDATE right on
-- the estates row, so this function must bypass that deliberately, after
-- checking membership itself.
-- ---------------------------------------------------------------------------
create function report_death(p_estate_id uuid) returns estates
security definer
language plpgsql
as $$
declare
  v_role member_role;
  v_estate estates;
begin
  if auth.uid() is null then
    raise exception 'must be authenticated to report a death';
  end if;

  select role into v_role
  from estate_members
  where estate_id = p_estate_id
    and user_id = auth.uid()
    and invite_status = 'accepted'
    and role in ('executor', 'helper');

  if v_role is null then
    raise exception 'only an accepted executor or helper may report a death for this estate';
  end if;

  perform set_config('aftervault.estate_status_transition_authorized', 'true', true);

  update estates
  set status = 'verifying', verification_started_at = now()
  where id = p_estate_id
    and status in ('active_living', 'checkin_overdue')
  returning * into v_estate;

  if v_estate.id is null then
    raise exception 'this estate is not in a state that can be reported (already being verified, or not yet active)';
  end if;

  insert into audit_logs (estate_id, actor_user_id, event_type, target_table, target_id, metadata)
  values (
    p_estate_id, auth.uid(), 'death_reported', 'estates', p_estate_id,
    jsonb_build_object('source', 'proactive_report', 'reporter_role', v_role)
  );

  return v_estate;
end;
$$ set search_path = public;

-- ---------------------------------------------------------------------------
-- self_cancel: the estate owner confirming they're alive while verifying.
-- Not SECURITY DEFINER — the owner already has UPDATE rights on their own
-- estate via estates_update_owner, so this runs as the caller and relies on
-- that existing grant; the explicit owner_user_id check below just gives a
-- clear application error instead of a generic RLS denial.
--
-- Gated on status = 'verifying' alone, not an additional elapsed-time
-- check: if escalate_lapsed_verifications() hasn't yet flipped the estate
-- to awaiting_death_certificate, self-cancel still succeeds even slightly
-- past the nominal window. Deliberate, per §4.2's stated asymmetry
-- ("self-cancel is cheap and fast; progressing past it is expensive and
-- slow") — err toward letting a live Planner cancel.
-- ---------------------------------------------------------------------------
create function self_cancel(p_estate_id uuid) returns estates
language plpgsql
as $$
declare
  v_estate estates;
begin
  if auth.uid() is null then
    raise exception 'must be authenticated to self-cancel';
  end if;

  perform set_config('aftervault.estate_status_transition_authorized', 'true', true);

  update estates
  set status = 'active_living', last_check_in_at = now()
  where id = p_estate_id
    and owner_user_id = auth.uid()
    and status = 'verifying'
  returning * into v_estate;

  if v_estate.id is null then
    raise exception 'self-cancel is only available to the estate owner while status is verifying';
  end if;

  insert into audit_logs (estate_id, actor_user_id, event_type, target_table, target_id, metadata)
  values (p_estate_id, auth.uid(), 'self_cancel_used', 'estates', p_estate_id, null);

  return v_estate;
end;
$$;

-- ---------------------------------------------------------------------------
-- escalate_overdue_to_verifying: the automated backstop entry point
-- (§4.3 — "backstopped by the automated check-in trigger even with zero
-- human reports"). Not covered by feature 2's literal scope (that job only
-- built active_living -> checkin_overdue) or this feature's literal scope,
-- but without it a checkin_overdue estate with no reporting executor/helper
-- never progresses, which contradicts §4.3 outright. Called by the same
-- cron route as mark_overdue_estates() (service role, no user session).
-- ---------------------------------------------------------------------------
create function escalate_overdue_to_verifying()
returns setof estates
language sql
as $$
  select set_config('aftervault.estate_status_transition_authorized', 'true', true);
  with escalated as (
    update estates
    set status = 'verifying', verification_started_at = now()
    where status = 'checkin_overdue'
      and last_check_in_at <= now() - ((check_in_interval_days + grace_period_days) * interval '1 day')
    returning *
  ), logged_report as (
    insert into audit_logs (estate_id, actor_user_id, event_type, target_table, target_id, metadata)
    select id, null, 'death_reported', 'estates', id, jsonb_build_object('source', 'automated_escalation')
    from escalated
    returning 1
  )
  select * from escalated;
$$;

-- ---------------------------------------------------------------------------
-- escalate_lapsed_verifications: the self-cancel window expiring with no
-- cancel. Service-role-triggered, same shape as the two functions above.
-- ---------------------------------------------------------------------------
create function escalate_lapsed_verifications()
returns setof estates
language sql
as $$
  select set_config('aftervault.estate_status_transition_authorized', 'true', true);
  with lapsed as (
    update estates
    set status = 'awaiting_death_certificate'
    where status = 'verifying'
      and verification_started_at <= now() - (self_cancel_window_days * interval '1 day')
    returning *
  ), logged as (
    insert into audit_logs (estate_id, actor_user_id, event_type, target_table, target_id, metadata)
    select
      id, null, 'verification_window_lapsed', 'estates', id,
      jsonb_build_object('verification_started_at', verification_started_at, 'self_cancel_window_days', self_cancel_window_days)
    from lapsed
    returning 1
  )
  select * from lapsed;
$$;
