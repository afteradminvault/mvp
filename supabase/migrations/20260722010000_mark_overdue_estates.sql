-- Milestone 2 feature 2: check-in-overdue detection (Security Architecture
-- §4.1's active_living -> checkin_overdue transition) — the entry point to
-- the death-verification pipeline.
--
-- check_in_interval_days is per-estate, so "overdue" can't be expressed as
-- a column-vs-literal filter (which is all PostgREST's REST query grammar
-- supports) — it needs a per-row comparison against another column on the
-- same row. That requires a real SQL statement, hence this function, even
-- though the caller (a Vercel Cron job, see src/app/api/cron/check-in-overdue)
-- runs as the service role and so already bypasses RLS on its own; this
-- function is not SECURITY DEFINER because there is no privilege gap to
-- close for that caller, only a query-expressiveness one.
--
-- The transition and its audit_logs row are written in one statement so
-- there's no window where an estate is marked checkin_overdue without a
-- corresponding audit trail entry (Security Architecture §4.2: "every step
-- ... is written to audit_logs"). actor_user_id is null — this is a
-- system-triggered event, per audit_logs' own schema comment.
--
-- Idempotent: re-running only matches rows still 'active_living', so a
-- retried or double-fired cron invocation is a no-op for estates already
-- transitioned.
create function mark_overdue_estates()
returns setof estates
language sql
as $$
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
