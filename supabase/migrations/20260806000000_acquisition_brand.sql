-- Two-Brand Foundation (Roadmap Addendum: Two-Brand Architecture,
-- Milestone 0 addition; Schema Addendum §2). Attribution only — never
-- referenced by RLS or any other access-control decision (Schema
-- Addendum §3). acquisition_brand is a brand-new enum, not a value added
-- to an existing one, so CREATE TYPE and its first use are safe in the
-- same transaction (the "own migration" rule elsewhere in this repo only
-- applies to ALTER TYPE ... ADD VALUE on a type other code already
-- depends on).

create type acquisition_brand as enum ('afteradmin', 'aftervault', 'direct', 'unknown');

alter table users add column acquisition_brand acquisition_brand not null default 'unknown';
alter table cases add column acquisition_brand acquisition_brand not null default 'unknown';

create index users_acquisition_brand_idx on users (acquisition_brand);
create index cases_acquisition_brand_idx on cases (acquisition_brand);

-- Note: subscriptions.acquisition_brand (Schema Addendum §2.4) is
-- deliberately NOT added here — that table doesn't exist yet (billing is
-- Milestone 6, still on hold). Add it inside that table's own migration.

-- Attribute the user at signup from auth metadata, the same mechanism
-- display_name already uses. Coalesces to 'unknown' so a signup that
-- somehow arrives without the header (e.g. a direct Supabase Auth API
-- call bypassing the app) doesn't fail — it just under-attributes.
create or replace function handle_new_auth_user() returns trigger as $$
begin
  insert into public.users (id, email, display_name, acquisition_brand)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data ->> 'acquisition_brand')::acquisition_brand, 'unknown')
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- create_draft_case() gains the same optional-param pattern already used
-- for p_is_self_planned (20260805000000_case_self_planned.sql) — a Case's
-- acquisition_brand is tracked independently of its creating user's own
-- (Schema Addendum §2.3: a user who signed up via one brand could still
-- create a Case while visiting the other later).
create or replace function create_draft_case(
  p_jurisdiction_id uuid,
  p_deceased_full_name text,
  p_deceased_date_of_birth date,
  p_deceased_relationship text,
  p_deceased_date_of_death date default null,
  p_check_in_interval_days int default 90,
  p_is_self_planned boolean default false,
  p_acquisition_brand acquisition_brand default 'unknown'
) returns cases as $$
declare
  v_case cases;
begin
  if auth.uid() is null then
    raise exception 'must be authenticated to create a case';
  end if;

  insert into cases (
    owner_user_id, jurisdiction_id, display_name, check_in_interval_days, status,
    deceased_full_name, deceased_date_of_birth, deceased_relationship, deceased_date_of_death,
    is_self_planned, acquisition_brand
  )
  values (
    auth.uid(), p_jurisdiction_id, p_deceased_full_name || '''s Case', p_check_in_interval_days, 'draft',
    p_deceased_full_name, p_deceased_date_of_birth, p_deceased_relationship, p_deceased_date_of_death,
    p_is_self_planned, p_acquisition_brand
  )
  returning * into v_case;

  insert into case_members (case_id, user_id, role, invite_email, invite_status, accepted_at)
  select v_case.id, auth.uid(), 'family', u.email, 'accepted', now()
  from users u where u.id = auth.uid();

  return v_case;
end;
$$ language plpgsql security definer set search_path = public;

notify pgrst, 'reload schema';
