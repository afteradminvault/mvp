-- PRD v2 §3.3 / US-2.4 (Pre-Populated Platform Checklist).
-- Expands `providers` in place rather than adding a separate `platforms`
-- table (per the resolved Milestone 0-equivalent decision for this
-- feature) — asset creation and the onboarding checklist share one
-- reference table. All new columns nullable/defaulted: existing provider
-- rows (created via the admin CRUD before this feature) have none of this
-- data yet, and backfilling it is a content task, not a migration concern.
create type closure_method as enum ('online_form', 'email', 'phone', 'automatic');

alter table providers add column closure_method closure_method null;
alter table providers add column bereavement_contact_email citext null;
alter table providers add column bereavement_contact_phone text null;
alter table providers add column bereavement_instructions_url text null;
alter table providers add column logo_url text null;
-- The onboarding checklist (US-2.4) shows a curated common subset, not
-- the full provider catalog (which also serves free-text asset-creation
-- autocomplete, where an obscure provider is just as valid an entry) —
-- this flag is that curation, admin-managed like every other provider field.
alter table providers add column is_common_onboarding_platform boolean not null default false;

create index providers_common_onboarding_idx
  on providers (is_common_onboarding_platform) where is_common_onboarding_platform = true;

notify pgrst, 'reload schema';
