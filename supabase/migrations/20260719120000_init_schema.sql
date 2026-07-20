-- AfterVault initial schema
-- Source of truth: docs/DATABASE_SCHEMA.md (approved).
-- Estate status values are refined from the doc's illustrative 6-state list to the
-- full 8-state machine specified in docs/SECURITY_ARCHITECTURE.md §4.1, since the
-- dead-man's-switch background job (Milestone 2) needs to distinguish
-- "checkin_overdue" from "death_reported" and "verifying" from
-- "awaiting_death_certificate" as distinct, independently-queryable states.

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ---------------------------------------------------------------------------
-- Enum types
-- ---------------------------------------------------------------------------

create type estate_status as enum (
  'setup',
  'active_living',
  'checkin_overdue',
  'death_reported',
  'verifying',
  'awaiting_death_certificate',
  'active_executor',
  'closed'
);

create type member_role as enum ('owner', 'executor', 'helper');
create type invite_status as enum ('pending', 'accepted', 'revoked');

create type asset_category as enum (
  'financial', 'social', 'subscription', 'crypto', 'cloud_storage', 'domain', 'other'
);

create type requirement_type as enum (
  'death_certificate_certified',
  'death_certificate_copy',
  'letters_testamentary',
  'letters_of_administration',
  'small_estate_affidavit',
  'executor_government_id',
  'notarization',
  'court_order',
  'provider_specific_form'
);

create type submission_channel as enum ('online_form', 'mail', 'in_person', 'api');

create type intended_outcome as enum ('close', 'transfer', 'memorialize', 'ignore', 'other');

create type vault_item_type as enum (
  'password', 'recovery_code', 'security_question', 'note', 'seed_phrase', 'other'
);

create type document_type as enum (
  'death_certificate',
  'letters_testamentary',
  'letters_of_administration',
  'small_estate_affidavit',
  'executor_government_id',
  'notarized_affidavit',
  'other'
);

create type closure_status as enum (
  'not_started', 'documents_gathered', 'submitted', 'in_progress',
  'resolved', 'rejected', 'needs_attention', 'out_of_scope'
);

create type notification_channel as enum ('email', 'sms', 'in_app');
create type notification_status as enum ('pending', 'sent', 'failed');
create type subscription_status as enum ('trialing', 'active', 'past_due', 'canceled');
create type payment_status as enum ('succeeded', 'failed', 'refunded');

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at current on any row update
-- ---------------------------------------------------------------------------

create function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------------
-- Identity: users (1:1 profile over Supabase Auth's auth.users)
-- ---------------------------------------------------------------------------

create table users (
  id uuid primary key references auth.users (id) on delete cascade,
  email citext not null unique,
  display_name text not null,
  mfa_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create index users_deleted_at_idx on users (deleted_at) where deleted_at is not null;

create trigger users_set_updated_at before update on users
  for each row execute function set_updated_at();

-- Auto-provision a public.users profile row whenever Supabase Auth creates
-- an auth.users row, so every FK to users(id) has something to reference the
-- moment signup completes. display_name/email come from signup metadata.
create function handle_new_auth_user() returns trigger as $$
begin
  insert into public.users (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- Reference data: jurisdictions
-- ---------------------------------------------------------------------------

create table jurisdictions (
  id uuid primary key default gen_random_uuid(),
  country_code char(2) not null,
  region_code text null,
  display_name text not null,
  is_supported boolean not null default false
);

create unique index jurisdictions_country_region_idx
  on jurisdictions (country_code, coalesce(region_code, ''));

-- ---------------------------------------------------------------------------
-- Estates
-- ---------------------------------------------------------------------------

create table estates (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references users (id) on delete restrict,
  jurisdiction_id uuid not null references jurisdictions (id) on delete restrict,
  display_name text not null,
  status estate_status not null default 'setup',
  check_in_interval_days int not null default 90,
  last_check_in_at timestamptz not null default now(),
  grace_period_days int not null default 14,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz null
);

create index estates_owner_user_id_idx on estates (owner_user_id);
create index estates_jurisdiction_id_idx on estates (jurisdiction_id);
create index estates_status_last_checkin_idx on estates (status, last_check_in_at);

create trigger estates_set_updated_at before update on estates
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Estate members: the RBAC backbone (see docs/DATABASE_SCHEMA.md §0, §2.4)
-- 🔒 access-control-relevant
-- ---------------------------------------------------------------------------

create table estate_members (
  id uuid primary key default gen_random_uuid(),
  estate_id uuid not null references estates (id) on delete cascade,
  user_id uuid null references users (id) on delete cascade,
  role member_role not null,
  invite_email citext not null,
  invite_token uuid not null default gen_random_uuid(),
  invite_status invite_status not null default 'pending',
  invited_at timestamptz not null default now(),
  accepted_at timestamptz null,
  fallback_order int null,
  wrapped_key_share bytea null,
  created_at timestamptz not null default now()
);

create index estate_members_estate_id_idx on estate_members (estate_id);
create unique index estate_members_estate_user_idx
  on estate_members (estate_id, user_id) where user_id is not null;
create unique index estate_members_one_owner_idx
  on estate_members (estate_id) where role = 'owner';
create unique index estate_members_invite_token_idx on estate_members (invite_token);

-- ---------------------------------------------------------------------------
-- Legal requirements reference data
-- ---------------------------------------------------------------------------

create table providers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  default_category asset_category not null,
  website_url text null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index providers_name_idx on providers (name);

create trigger providers_set_updated_at before update on providers
  for each row execute function set_updated_at();

create table legal_requirements (
  id uuid primary key default gen_random_uuid(),
  jurisdiction_id uuid not null references jurisdictions (id) on delete restrict,
  asset_category asset_category not null,
  provider_id uuid null references providers (id) on delete cascade,
  requirement_type requirement_type not null,
  submission_channel submission_channel not null,
  submission_detail text null,
  display_order int not null default 0,
  effective_date date not null default current_date,
  superseded_by_id uuid null references legal_requirements (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index legal_requirements_lookup_idx
  on legal_requirements (jurisdiction_id, asset_category, provider_id);
create index legal_requirements_superseded_by_idx on legal_requirements (superseded_by_id);

create trigger legal_requirements_set_updated_at before update on legal_requirements
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Digital assets + beneficiaries (circular FK, resolved via deferred column add)
-- ---------------------------------------------------------------------------

create table digital_assets (
  id uuid primary key default gen_random_uuid(),
  estate_id uuid not null references estates (id) on delete cascade,
  category asset_category not null,
  provider_id uuid null references providers (id) on delete set null,
  custom_provider_name text null,
  account_identifier text null,
  intended_outcome intended_outcome not null default 'other',
  intended_outcome_notes text null,
  estimated_value_cents bigint null,
  currency char(3) null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null
);

create index digital_assets_estate_id_idx on digital_assets (estate_id);
create index digital_assets_estate_category_idx on digital_assets (estate_id, category);
create index digital_assets_provider_id_idx on digital_assets (provider_id);

create trigger digital_assets_set_updated_at before update on digital_assets
  for each row execute function set_updated_at();

create table beneficiaries (
  id uuid primary key default gen_random_uuid(),
  estate_id uuid not null references estates (id) on delete cascade,
  digital_asset_id uuid null references digital_assets (id) on delete set null,
  display_name text not null,
  relationship text null,
  contact_email citext null,
  linked_user_id uuid null references users (id) on delete set null,
  notes text null,
  created_at timestamptz not null default now()
);

create index beneficiaries_estate_id_idx on beneficiaries (estate_id);
create index beneficiaries_digital_asset_id_idx on beneficiaries (digital_asset_id);

alter table digital_assets
  add column primary_beneficiary_id uuid null references beneficiaries (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Vault items: zero-knowledge encrypted secret storage
-- 🔒 access-control-relevant / security-sensitive — see docs/SECURITY_ARCHITECTURE.md §1
-- ---------------------------------------------------------------------------

create table digital_vault_items (
  id uuid primary key default gen_random_uuid(),
  digital_asset_id uuid not null references digital_assets (id) on delete cascade,
  item_type vault_item_type not null,
  ciphertext bytea not null,
  encryption_iv bytea not null,
  wrapped_data_key bytea not null,
  key_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index digital_vault_items_digital_asset_id_idx on digital_vault_items (digital_asset_id);

create trigger digital_vault_items_set_updated_at before update on digital_vault_items
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Documents & closure requests
-- ---------------------------------------------------------------------------

create table documents (
  id uuid primary key default gen_random_uuid(),
  estate_id uuid not null references estates (id) on delete cascade,
  uploaded_by_user_id uuid not null references users (id) on delete restrict,
  document_type document_type not null,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  file_size_bytes bigint not null,
  is_certified_original boolean not null default false,
  notes text null,
  uploaded_at timestamptz not null default now()
);

create index documents_estate_id_idx on documents (estate_id);
create index documents_estate_type_idx on documents (estate_id, document_type);

create table account_closure_requests (
  id uuid primary key default gen_random_uuid(),
  digital_asset_id uuid not null references digital_assets (id) on delete cascade,
  estate_id uuid not null references estates (id) on delete cascade,
  status closure_status not null default 'not_started',
  assigned_to_user_id uuid null references users (id) on delete set null,
  legal_requirement_snapshot jsonb not null default '[]'::jsonb,
  last_status_change_at timestamptz not null default now(),
  resolved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index account_closure_requests_estate_id_idx on account_closure_requests (estate_id);
create index account_closure_requests_asset_id_idx on account_closure_requests (digital_asset_id);
create index account_closure_requests_status_stale_idx
  on account_closure_requests (status, last_status_change_at);

create trigger account_closure_requests_set_updated_at before update on account_closure_requests
  for each row execute function set_updated_at();

create table account_closure_request_documents (
  id uuid primary key default gen_random_uuid(),
  account_closure_request_id uuid not null references account_closure_requests (id) on delete cascade,
  document_id uuid not null references documents (id) on delete cascade,
  attached_at timestamptz not null default now()
);

create unique index acrd_request_document_idx
  on account_closure_request_documents (account_closure_request_id, document_id);
create index acrd_document_id_idx on account_closure_request_documents (document_id);

-- ---------------------------------------------------------------------------
-- Audit logs: append-only (Postgres-level, not just RLS — see below)
-- 🔒 access-control-relevant
-- ---------------------------------------------------------------------------

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  estate_id uuid null references estates (id) on delete set null,
  actor_user_id uuid null references users (id) on delete set null,
  event_type text not null,
  target_table text null,
  target_id uuid null,
  metadata jsonb null,
  ip_address inet null,
  created_at timestamptz not null default now()
);

create index audit_logs_estate_created_idx on audit_logs (estate_id, created_at);
create index audit_logs_actor_created_idx on audit_logs (actor_user_id, created_at);
create index audit_logs_event_type_idx on audit_logs (event_type);

-- ---------------------------------------------------------------------------
-- Notifications & billing
-- ---------------------------------------------------------------------------

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  estate_id uuid null references estates (id) on delete cascade,
  notification_type text not null,
  channel notification_channel not null,
  status notification_status not null default 'pending',
  payload jsonb not null default '{}'::jsonb,
  sent_at timestamptz null,
  created_at timestamptz not null default now()
);

create index notifications_user_created_idx on notifications (user_id, created_at);
create index notifications_pending_idx on notifications (status) where status = 'pending';

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete restrict,
  plan text not null,
  status subscription_status not null,
  external_customer_id text not null,
  external_subscription_id text not null,
  current_period_end timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index subscriptions_user_id_idx on subscriptions (user_id);
create unique index subscriptions_external_subscription_id_idx on subscriptions (external_subscription_id);

create trigger subscriptions_set_updated_at before update on subscriptions
  for each row execute function set_updated_at();

create table payments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references subscriptions (id) on delete cascade,
  amount_cents int not null,
  currency char(3) not null,
  status payment_status not null,
  external_payment_id text not null,
  created_at timestamptz not null default now()
);

create index payments_subscription_id_idx on payments (subscription_id);
create unique index payments_external_payment_id_idx on payments (external_payment_id);
