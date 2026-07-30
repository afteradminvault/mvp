-- PRD v2 / Milestone 5 (Notification Letter Generator), US-6.1-US-6.6.
-- "Deceased profile" (US-6.1) already exists: cases.deceased_full_name/
-- deceased_date_of_death, populated by create_draft_case() (Milestone 1
-- feature 1) — no new case-level columns needed here.

-- supports_memorialize (US-6.2): same "expand providers in place" pattern
-- as closure_method/bereavement_contact_* — a platform property, not a
-- letter property, so it lives on providers, not notification_letters.
alter table providers add column supports_memorialize boolean not null default false;

create type notification_letter_type as enum ('close', 'memorialize');
create type notification_letter_sent_via as enum ('email', 'download', 'copy');

create table notification_letters (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  platform_id uuid not null references providers(id) on delete restrict,
  created_by_user_id uuid not null references users(id),
  letter_type notification_letter_type not null,
  content text not null,
  -- Both null until finalized (US-6.3's "before finalization" implies an
  -- editable draft state) — the PATCH-content endpoint refuses once
  -- sent_at is set, and the finalize endpoint is what sets these two,
  -- together, atomically. sent_via/sent_at double as US-6.6's log; no
  -- separate table per the spreadsheet's own note.
  sent_via notification_letter_sent_via null,
  sent_at timestamptz null,
  -- Generated + stored on every finalize path (US-6.5), not just "download"
  -- — points at the same `documents` bucket/table as every other
  -- case document, so it "just appears" in the existing document list
  -- with zero new UI surface, per that story's own AC.
  pdf_document_id uuid null references documents(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notification_letters_case_id_idx on notification_letters(case_id);

create trigger notification_letters_set_updated_at
  before update on notification_letters
  for each row execute function set_updated_at();

alter table notification_letters enable row level security;

-- Read: any accepted member (Family or Executor — US-6.6 lists both as
-- viewers of the log). Write: Family only (every other US-6.x story lists
-- Role: Family) — same is_case_member role-array pattern as documents'
-- own write policy, minus 'executor'.
create policy notification_letters_select_member on notification_letters for select
  using (is_case_member(case_id));

create policy notification_letters_write_family on notification_letters for all
  using (is_case_member(case_id, array['family']::case_member_role[]))
  with check (is_case_member(case_id, array['family']::case_member_role[]));

notify pgrst, 'reload schema';
