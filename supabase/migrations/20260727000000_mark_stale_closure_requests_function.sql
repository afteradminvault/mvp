-- ---------------------------------------------------------------------------
-- Milestone 2 feature 8: stale-request nudges (PRD §5, Database Schema
-- §5.2). Atomically selects closure requests that have gone stale (status
-- in ('submitted','in_progress') with no status change in
-- p_threshold_days, via the (status, last_status_change_at) index built in
-- the initial schema migration) and haven't already been nudged for this
-- staleness episode (stale_nudge_sent_at is null — cleared on every status
-- change, see updateClosureRequest in
-- src/infrastructure/closure-requests/supabase-closure-request-repository.ts),
-- marking them nudged in the same statement so a crash/timeout between this
-- call and the email send can't cause a duplicate email tomorrow — favors
-- "at most once" over "at least once," matching PRD §5's "one nudge, not a
-- daily spam loop." Service-role-triggered, same shape as the dead-man's-
-- switch sweep functions in 20260722010000_mark_overdue_estates.sql and
-- 20260723000200_death_verification_functions.sql — the audit log entry is
-- written here for the same reason theirs is: the transition (here, being
-- flagged as nudged) and its audit record must never be separable by a
-- crash between two calls. It records that a nudge was triggered, not
-- whether the email actually sent — that outcome can't be known inside
-- this function, same limitation noted on verification_notice_sent.
-- ---------------------------------------------------------------------------
create function mark_stale_closure_requests_needing_nudge(p_threshold_days int default 14)
returns table (
  id uuid,
  estate_id uuid,
  digital_asset_id uuid,
  assigned_to_user_id uuid,
  status closure_status,
  last_status_change_at timestamptz
)
language sql
as $$
  with stale as (
    update account_closure_requests
    set stale_nudge_sent_at = now()
    where status in ('submitted', 'in_progress')
      and last_status_change_at <= now() - (p_threshold_days * interval '1 day')
      and stale_nudge_sent_at is null
    returning *
  ), logged as (
    insert into audit_logs (estate_id, actor_user_id, event_type, target_table, target_id, metadata)
    select
      stale.estate_id, null, 'closure_request_stale_nudge_sent', 'account_closure_requests', stale.id,
      jsonb_build_object('status', stale.status, 'last_status_change_at', stale.last_status_change_at)
    from stale
    returning 1
  )
  select
    stale.id, stale.estate_id, stale.digital_asset_id, stale.assigned_to_user_id,
    stale.status, stale.last_status_change_at
  from stale;
$$;
