-- PRD v2 §3.2 / "Case Management & Onboarding" epic, US-2.1 (Case Creation)
-- and US-2.2 (Onboarding Draft/Resume).
--
-- draft_step/draft_payload: server-side onboarding progress (Database
-- Schema v2 §2.3's "so it survives a device change, not just a browser
-- refresh"). Both nullable/defaulted so existing rows (created via the
-- unrelated create_case()/`/estates/new` path, which never touches
-- onboarding at all) are unaffected.
alter table cases add column draft_step text null;
alter table cases add column draft_payload jsonb not null default '{}'::jsonb;

-- create_draft_case(): deliberately NOT a modification of create_case()
-- (20260730000100_case_member_role_and_rls.sql) — that function backs the
-- still-live /estates/new flow, which creates directly in active_living
-- and must keep doing so unchanged. This is the new entry point for the
-- onboarding flow specifically, starting in 'draft'.
--
-- display_name is derived from deceased_full_name rather than collected
-- as a separate field — asking for both a "case name" and a "deceased
-- person's name" in the same short form is redundant (confirmed: one
-- unified onboarding flow, not two).
--
-- date_of_death is optional (nullable) — per PRD v2 §0 and the resolved
-- Milestone 0 schema decision, a Case can be opened either pre-death
-- (blank) or post-death (filled in) from the same form; the copy differs,
-- the data model doesn't. What does NOT differ regardless of which: this
-- still only reaches active_executor through the existing
-- report_death()/verification pipeline once onboarding completes — a
-- known simplification (a family member onboarding a case for someone
-- already deceased still has to separately call report_death() later),
-- not a redesign of that pipeline. Revisit if that friction turns out to
-- matter in practice.
create function create_draft_case(
  p_jurisdiction_id uuid,
  p_deceased_full_name text,
  p_deceased_date_of_birth date,
  p_deceased_relationship text,
  p_deceased_date_of_death date default null,
  p_check_in_interval_days int default 90
) returns cases as $$
declare
  v_case cases;
begin
  if auth.uid() is null then
    raise exception 'must be authenticated to create a case';
  end if;

  insert into cases (
    owner_user_id, jurisdiction_id, display_name, check_in_interval_days, status,
    deceased_full_name, deceased_date_of_birth, deceased_relationship, deceased_date_of_death
  )
  values (
    auth.uid(), p_jurisdiction_id, p_deceased_full_name || '''s Case', p_check_in_interval_days, 'draft',
    p_deceased_full_name, p_deceased_date_of_birth, p_deceased_relationship, p_deceased_date_of_death
  )
  returning * into v_case;

  insert into case_members (case_id, user_id, role, invite_email, invite_status, accepted_at)
  select v_case.id, auth.uid(), 'family', u.email, 'accepted', now()
  from users u where u.id = auth.uid();

  return v_case;
end;
$$ language plpgsql security definer set search_path = public;

-- activate_draft_case(): the one and only path from draft -> active_living,
-- authorized through the same guard-trigger mechanism as report_death()/
-- self_cancel() (20260723000100_estate_status_transition_guard.sql) rather
-- than a raw PATCH, consistent with every other status transition in this
-- schema. Idempotency is deliberately NOT provided here (re-calling once
-- already active_living raises, same as the update-count-zero pattern
-- used by self_cancel()) — completing onboarding is a one-time, explicit
-- user action, not a sweep function that might double-fire.
create function activate_draft_case(p_case_id uuid) returns cases as $$
declare
  v_case cases;
begin
  if not is_case_member(p_case_id, array['family']::case_member_role[]) then
    raise exception 'only the case owner can complete onboarding';
  end if;

  perform set_config('aftervault.estate_status_transition_authorized', 'true', true);

  update cases
  set status = 'active_living'
  where id = p_case_id
    and status = 'draft'
  returning * into v_case;

  if v_case.id is null then
    raise exception 'this case is not in draft status';
  end if;

  insert into audit_logs (estate_id, actor_user_id, event_type, target_table, target_id, metadata)
  values (p_case_id, auth.uid(), 'case_onboarding_completed', 'cases', p_case_id, null);

  return v_case;
end;
$$ language plpgsql security definer set search_path = public;

notify pgrst, 'reload schema';
