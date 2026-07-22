-- Milestone 2 feature 1 (legal requirements admin CRUD, Development Roadmap).
--
-- 1. legal_requirements gets two additive columns: a free-text `notes`
--    field (mirroring providers.notes' precedent for internal admin
--    context) and a structured `pending_counsel_review` boolean — the
--    explicit, filterable flag the roadmap calls for ("explicitly mark
--    every 🚩 item ... as unresolved/pending-counsel in the seeded data,"
--    not just a note buried in free text).
--
-- 2. A country-level jurisdiction row (region_code null — Database Schema
--    §2.2's own documented meaning: "null = country-level default") for
--    baseline, state-agnostic legal_requirements content to attach to.
--    is_supported = false: a Planner picking their estate's jurisdiction
--    needs a specific state for probate purposes, so this row is never
--    offered in that picker — it exists only as a legal_requirements
--    anchor for content that doesn't vary by state.

alter table legal_requirements add column notes text null;
alter table legal_requirements add column pending_counsel_review boolean not null default false;

insert into jurisdictions (country_code, region_code, display_name, is_supported)
values ('US', null, 'United States (all states, baseline)', false)
on conflict (country_code, coalesce(region_code, '')) do nothing;
