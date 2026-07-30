-- Will Builder epic — the core wills/will_versions/will_bequests tables.
-- Lives inside a self-planned Case (cases.is_self_planned, previous
-- migration): testator identity/DOB/jurisdiction are read live from the
-- parent cases row, never duplicated here, and executor + alternate are
-- read live from case_members (role='executor', ordered by
-- fallback_order) rather than stored on the will at all — nominating or
-- changing an executor via the existing invite flow is automatically
-- reflected the next time the will is generated.

create type will_status as enum ('draft', 'ready_to_sign', 'executed', 'superseded', 'revoked');

create type bequest_category as enum (
  'real_property',
  'financial_account',
  'business_interest',
  'personal_property',
  'digital_asset',
  'vehicle',
  'other'
);

-- current_version_id's FK is added via a later ALTER, once will_versions
-- exists (forward references across two new tables in one migration are
-- easiest to express in creation order, not a single circular CREATE).
create table wills (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null unique references cases(id) on delete cascade,
  status will_status not null default 'draft',
  guardian_full_name text null,
  guardian_relationship text null,
  alternate_guardian_full_name text null,
  alternate_guardian_relationship text null,
  has_minor_children boolean not null default false,
  residuary_beneficiary_description text null,
  current_version_id uuid null,
  executed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger wills_set_updated_at before update on wills
  for each row execute function set_updated_at();

-- Frozen snapshot each time the document is (re)generated — mirrors
-- legal_requirements' revision-not-overwrite pattern
-- (supabase/migrations/20260719120000_init_schema.sql +
-- 20260722000200_revise_legal_requirement.sql). A superseded will's prior
-- content is never destroyed; it's still evidence of prior intent.
create table will_versions (
  id uuid primary key default gen_random_uuid(),
  will_id uuid not null references wills(id) on delete cascade,
  content text not null,
  generated_at timestamptz not null default now()
);

create index will_versions_will_id_idx on will_versions (will_id);

alter table wills add constraint wills_current_version_id_fkey
  foreign key (current_version_id) references will_versions(id);

-- The actual bequests (US-6.x-style category breakdown). A link (asset or
-- beneficiary) or a free-text description is required — not both — see
-- WillService's own validation; only bequest_category='digital_asset' can
-- ever meaningfully link to digital_asset_id, since digital_assets only
-- models online accounts, not real property/vehicles/business interests/
-- personal property, which stay free text regardless.
create table will_bequests (
  id uuid primary key default gen_random_uuid(),
  will_id uuid not null references wills(id) on delete cascade,
  bequest_category bequest_category not null,
  digital_asset_id uuid null references digital_assets(id) on delete set null,
  beneficiary_id uuid null references beneficiaries(id) on delete set null,
  description text null,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index will_bequests_will_id_idx on will_bequests (will_id);

create trigger will_bequests_set_updated_at before update on will_bequests
  for each row execute function set_updated_at();

alter table wills enable row level security;
alter table will_versions enable row level security;
alter table will_bequests enable row level security;

-- Select: any accepted case member (the testator themselves, and their
-- nominated executor once relevant — an executor should be able to see
-- the will's status/content once appointed, same visibility model as
-- documents). Write: family only (the case owner IS the testator in a
-- self-planned case — is_case_member's existing role-array pattern).
create policy wills_select_member on wills for select
  using (is_case_member(case_id));
create policy wills_write_family on wills for all
  using (is_case_member(case_id, array['family']::case_member_role[]))
  with check (is_case_member(case_id, array['family']::case_member_role[]));

create policy will_versions_select_member on will_versions for select
  using (exists (select 1 from wills w where w.id = will_versions.will_id and is_case_member(w.case_id)));
create policy will_versions_write_family on will_versions for all
  using (
    exists (
      select 1 from wills w
      where w.id = will_versions.will_id and is_case_member(w.case_id, array['family']::case_member_role[])
    )
  )
  with check (
    exists (
      select 1 from wills w
      where w.id = will_versions.will_id and is_case_member(w.case_id, array['family']::case_member_role[])
    )
  );

create policy will_bequests_select_member on will_bequests for select
  using (exists (select 1 from wills w where w.id = will_bequests.will_id and is_case_member(w.case_id)));
create policy will_bequests_write_family on will_bequests for all
  using (
    exists (
      select 1 from wills w
      where w.id = will_bequests.will_id and is_case_member(w.case_id, array['family']::case_member_role[])
    )
  )
  with check (
    exists (
      select 1 from wills w
      where w.id = will_bequests.will_id and is_case_member(w.case_id, array['family']::case_member_role[])
    )
  );

notify pgrst, 'reload schema';
