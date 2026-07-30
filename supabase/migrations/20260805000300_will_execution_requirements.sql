-- Will Builder epic — jurisdiction-specific execution requirements
-- (witnesses, notarization, self-proving affidavits, holographic wills),
-- the single most state-variable part of a will. Near-exact mirror of
-- legal_requirements (supabase/migrations/20260719120000_init_schema.sql,
-- 20260722000200_revise_legal_requirement.sql): revision-based, never an
-- in-place update of content columns — reviseRequirement() semantics apply
-- here too.
--
-- Deliberately ships with NO seed data and pending_counsel_review
-- defaulting to TRUE (the opposite of legal_requirements' default false).
-- Fabricating real per-jurisdiction witness/notarization law would be
-- actively dangerous — an invalid will has real legal consequences, a
-- materially higher bar than a wrong bereavement phone number. This table
-- is empty until AfterVault's own legal team populates it; the wizard
-- must refuse to finalize a will for a jurisdiction with no requirements
-- on file rather than silently proceeding without them.
create table will_execution_requirements (
  id uuid primary key default gen_random_uuid(),
  jurisdiction_id uuid not null references jurisdictions(id) on delete restrict,
  witness_count int not null default 2,
  notarization_required boolean not null default false,
  self_proving_affidavit_available boolean not null default false,
  holographic_wills_allowed boolean not null default false,
  execution_instructions text not null,
  effective_date date not null default current_date,
  superseded_by_id uuid null references will_execution_requirements(id),
  notes text null,
  pending_counsel_review boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index will_execution_requirements_jurisdiction_idx on will_execution_requirements (jurisdiction_id);
create index will_execution_requirements_superseded_by_idx on will_execution_requirements (superseded_by_id);

create trigger will_execution_requirements_set_updated_at before update on will_execution_requirements
  for each row execute function set_updated_at();

alter table will_execution_requirements enable row level security;
-- Public read (same as legal_requirements_select_all) — the wizard needs
-- to show requirements before generation, to any authenticated user
-- planning a will, not just case members.
create policy will_execution_requirements_select_all on will_execution_requirements for select using (true);
create policy will_execution_requirements_admin_write on will_execution_requirements for all
  using (is_platform_admin()) with check (is_platform_admin());

-- Same two-writes-in-one-transaction shape as revise_legal_requirement()
-- (supabase/migrations/20260722000200_revise_legal_requirement.sql) — not
-- security definer, since will_execution_requirements_admin_write RLS
-- already correctly gates this table and both statements should get that
-- same protection, not bypass it.
create function revise_will_execution_requirement(
  p_existing_id uuid,
  p_jurisdiction_id uuid,
  p_witness_count int,
  p_notarization_required boolean,
  p_self_proving_affidavit_available boolean,
  p_holographic_wills_allowed boolean,
  p_execution_instructions text,
  p_notes text,
  p_pending_counsel_review boolean
) returns will_execution_requirements as $$
declare
  v_new will_execution_requirements;
begin
  insert into will_execution_requirements
    (jurisdiction_id, witness_count, notarization_required, self_proving_affidavit_available,
     holographic_wills_allowed, execution_instructions, notes, pending_counsel_review)
  values
    (p_jurisdiction_id, p_witness_count, p_notarization_required, p_self_proving_affidavit_available,
     p_holographic_wills_allowed, p_execution_instructions, p_notes, p_pending_counsel_review)
  returning * into v_new;

  update will_execution_requirements set superseded_by_id = v_new.id where id = p_existing_id;

  return v_new;
end;
$$ language plpgsql;

notify pgrst, 'reload schema';
