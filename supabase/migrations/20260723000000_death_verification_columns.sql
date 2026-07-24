-- Milestone 2 feature 3: death reporting + verification workflow
-- (Security Architecture §4.1/§4.2).
--
-- Neither column existed yet: last_check_in_at's "when did this state
-- begin" role has no equivalent for the verifying state, and the
-- self-cancel window (§4.2 recommends 7 days) needs to be per-estate
-- configurable, matching check_in_interval_days/grace_period_days.
alter table estates
  add column verification_started_at timestamptz null,
  add column self_cancel_window_days int not null default 7;
