-- Milestone 2 feature 8: stale-request nudges (PRD §5 — "One nudge, not a
-- daily spam loop"). Tracks whether a nudge has already been sent for the
-- CURRENT staleness episode, so the daily sweep doesn't re-notify every
-- run. Cleared whenever status changes (see
-- SupabaseClosureRequestRepository.updateClosureRequest) so a request that
-- goes stale again later, after being touched, gets a fresh nudge.
alter table account_closure_requests
  add column stale_nudge_sent_at timestamptz null;
