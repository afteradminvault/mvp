-- Milestone 2 feature 4: documents CRUD + death-certificate gate
-- (Database Schema §5.1, API Specification §9, Security Architecture
-- §4.1). The `documents` table and its row RLS already existed from the
-- initial schema migration (20260719120000/20260719120100) — this adds
-- the Storage bucket for the actual file blobs and the gate function.
--
-- Private bucket — signed URLs only, never a public storage URL (API spec
-- §9's explicit requirement). file_size_limit/allowed_mime_types mirror
-- the app-layer validation in the domain service as defense-in-depth.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  15728640,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/webp']
)
on conflict (id) do nothing;

-- Storage RLS mirrors the documents table's own policies
-- (documents_select_member / documents_write_owner_or_executor), keyed off
-- the estate_id folder segment in the object path ({estate_id}/{document_id}),
-- per Tech Stack doc's stated intent ("storage-level policies keyed off the
-- same estate_members logic").
create policy documents_storage_select_member on storage.objects for select
  using (bucket_id = 'documents' and is_estate_member((storage.foldername(name))[1]::uuid));

create policy documents_storage_insert_owner_or_executor on storage.objects for insert
  with check (
    bucket_id = 'documents'
    and is_estate_member((storage.foldername(name))[1]::uuid, array['owner', 'executor']::member_role[])
  );

create policy documents_storage_delete_owner_or_executor on storage.objects for delete
  using (
    bucket_id = 'documents'
    and is_estate_member((storage.foldername(name))[1]::uuid, array['owner', 'executor']::member_role[])
  );

-- ---------------------------------------------------------------------------
-- activate_executor: the hard gate itself (Security Architecture §4.1 —
-- "there is no route to active_executor that skips the death-certificate
-- requirement"). Independently re-checks membership, the certificate's
-- actual existence in the documents table, and the current status every
-- time it's called — it never trusts a caller's claim that a certificate
-- was just uploaded, so no future caller (the upload route, the standalone
-- activation endpoint, or anything else) can bypass the requirement by
-- skipping a check it was supposed to do first. This is the only function
-- that can move an estate into active_executor — the guard trigger from
-- feature 3 (20260723000100_estate_status_transition_guard.sql) already
-- blocks any other route from setting status directly.
--
-- SECURITY DEFINER because an executor (who legitimately needs to trigger
-- this, per API spec §9/§4) has no UPDATE right on estates via RLS —
-- estates_update_owner only grants the owner.
-- ---------------------------------------------------------------------------
create function activate_executor(p_estate_id uuid) returns estates
security definer
language plpgsql
as $$
declare
  v_estate estates;
  v_has_certificate boolean;
begin
  if auth.uid() is null then
    raise exception 'must be authenticated';
  end if;

  if not is_estate_member(p_estate_id, array['owner', 'executor']::member_role[]) then
    raise exception 'only the owner or an accepted executor may activate executor access';
  end if;

  select exists (
    select 1 from documents
    where estate_id = p_estate_id and document_type = 'death_certificate'
  ) into v_has_certificate;

  if not v_has_certificate then
    raise exception 'a death certificate document must be attached before executor access can be activated';
  end if;

  perform set_config('aftervault.estate_status_transition_authorized', 'true', true);

  update estates
  set status = 'active_executor'
  where id = p_estate_id
    and status = 'awaiting_death_certificate'
  returning * into v_estate;

  if v_estate.id is null then
    raise exception 'this estate is not awaiting a death certificate';
  end if;

  insert into audit_logs (estate_id, actor_user_id, event_type, target_table, target_id, metadata)
  values (p_estate_id, auth.uid(), 'active_executor_activated', 'estates', p_estate_id, null);

  return v_estate;
end;
$$ set search_path = public;
