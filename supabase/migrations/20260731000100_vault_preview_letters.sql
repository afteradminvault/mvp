-- PRD v2 / Database Schema v2 §2.10 (US-3.6, security-sensitive). A
-- generated letter for a Family member's lawyer, listing vault item-type
-- counts only ("3 passwords, 1 crypto_seed_phrase") — never a label,
-- account identifier, or value. This is structurally enforced upstream,
-- not just by convention: digital_vault_items has no label/username field
-- at all (id, digital_asset_id, item_type, ciphertext, encryption_iv,
-- wrapped_data_key, key_version — Database Schema §4.2), and the server
-- never sees plaintext regardless (zero-knowledge design, Security
-- Architecture §1) — the only thing that *could* leak into this table is
-- item_type counts, which is exactly what it's for. item_type_summary is
-- a jsonb snapshot (not a live view) so a letter already handed to a
-- lawyer doesn't silently change if vault contents change afterward.
--
-- No RPC needed for generation — a plain RLS-gated insert, not a
-- privilege-elevation case like create_case()/create_draft_case(). Access
-- mirrors "any accepted case member," deliberately not re-implementing
-- digital_vault_items' own family/executor/active_executor distinctions
-- here: the app layer computes item_type_summary by reading through the
-- existing, already-correctly-scoped vault-item repository, so a member
-- with limited or no vault access (e.g. an executor pre-verification)
-- naturally gets a correspondingly limited or empty count, never an
-- RLS bypass on the underlying items.
create table vault_preview_letters (
  id uuid primary key default gen_random_uuid(),
  estate_id uuid not null references cases (id) on delete cascade,
  generated_by_user_id uuid not null references users (id) on delete restrict,
  item_type_summary jsonb not null,
  generated_at timestamptz not null default now()
);

create index vault_preview_letters_estate_id_idx on vault_preview_letters (estate_id);

alter table vault_preview_letters enable row level security;

create policy vault_preview_letters_select_member on vault_preview_letters for select
  using (is_case_member(estate_id));

create policy vault_preview_letters_insert_member on vault_preview_letters for insert
  with check (is_case_member(estate_id) and generated_by_user_id = auth.uid());

-- No update/delete policy: a letter is an immutable record of what was
-- disclosed to a lawyer at a point in time, same rationale as audit_logs'
-- append-only design (Database Schema §6.1) though enforced here via RLS
-- rather than a role-level grant revocation, since this table (unlike
-- audit_logs) isn't written by the service role.

notify pgrst, 'reload schema';
