-- PRD v2 / Milestone 0 feature 3 (Role-Based Access Control) 🔒
-- Renames "Estate" to "Case" per PRD v2 §0. Table/column renames only —
-- Postgres tracks FK/RLS/trigger dependencies by OID, not by name, so
-- `ALTER TABLE ... RENAME` is transparent to every existing constraint,
-- index, and RLS policy defined against these tables. What is NOT free is
-- anything that references these tables by name from inside a function
-- BODY (PL/pgSQL statements are re-resolved by name against the current
-- catalog) — those are all handled in the companion migration
-- 20260730000100_case_member_role_and_rls.sql, which also carries the
-- role-enum rename (owner/helper -> family, per PRD v2 §2/§8 Q3) since
-- that touches the same functions.
--
-- Schema-readiness for PRD v2 §0/§8 Q1 (Case creation timing, resolved:
-- support both pre-death and post-death creation from the start): adds a
-- nullable owner_user_id (a Case opened by a Family member for someone
-- already deceased may have no living "owner" account at all) and a
-- deceased-profile sub-object (full name / DOB / DOD / relationship) per
-- PRD v2 §3.2. These columns are added now so a later Case Management
-- epic doesn't need a second migration — they are not yet populated or
-- validated by any UI/API in this pass; that's separate, later work.

alter table estates rename to cases;
alter table estate_members rename to case_members;
alter table case_members rename column estate_id to case_id;

alter table cases alter column owner_user_id drop not null;
alter table cases add column deceased_full_name text null;
alter table cases add column deceased_date_of_birth date null;
alter table cases add column deceased_date_of_death date null;
alter table cases add column deceased_relationship text null;

-- Index/trigger renames: purely cosmetic (Postgres doesn't require this —
-- these objects keep working under their old names after the table
-- rename), done only so `\d cases` / `\d case_members` doesn't show
-- estate-prefixed names attached to case-prefixed tables.
alter index estates_owner_user_id_idx rename to cases_owner_user_id_idx;
alter index estates_jurisdiction_id_idx rename to cases_jurisdiction_id_idx;
alter index estates_status_last_checkin_idx rename to cases_status_last_checkin_idx;
alter trigger estates_set_updated_at on cases rename to cases_set_updated_at;
alter trigger estates_guard_status_transition on cases rename to cases_guard_status_transition;

alter index estate_members_estate_id_idx rename to case_members_case_id_idx;
alter index estate_members_estate_user_idx rename to case_members_case_user_idx;
alter index estate_members_invite_token_idx rename to case_members_invite_token_idx;
-- estate_members_one_owner_idx is NOT renamed here — its predicate
-- (`where role = 'owner'`) references a role value being renamed to
-- 'family' in the companion migration, so it has to be dropped and
-- recreated there, not just renamed.

-- Every other table's own estate_id FK column (digital_assets, documents,
-- account_closure_requests, beneficiaries, audit_logs, notifications)
-- deliberately keeps its current name. The FK itself still validly points
-- at the renamed `cases` table (also OID-tracked); only case_members got
-- its column renamed because membership/RBAC is what this feature is
-- actually about. Those other tables' repositories, routes, and RLS
-- policy names are untouched by this migration, per the agreed scope —
-- see the RLS policy list in the companion migration for exactly which
-- policies *do* need recreating (because they call a function being
-- renamed / reference a role value being renamed), which is a different
-- set from "every table that has an estate_id column."

notify pgrst, 'reload schema';
