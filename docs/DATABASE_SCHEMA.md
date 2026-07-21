# AfterVault — Database Schema (PostgreSQL)

Status: Draft v1 — for founder review. Designed for Postgres with `pgcrypto`/`uuid-ossp` (or `gen_random_uuid()`, native since PG13) for UUID generation, and `jsonb` for semi-structured snapshot/audit data.

## 0. Design Decisions & Deviations from the Literal Table List

The brief asked for tables including `executors` and `beneficiaries`. Two judgment calls worth flagging explicitly rather than silently deciding:

1. **No standalone `executors` table.** Executor, Helper, and Owner(Planner) are all *roles a user holds on a specific estate*, and the PRD's role model (§2, §4.1) treats them uniformly for access-control purposes (who can see the vault, who can see status-only, etc.). Modeling them as three separate tables would mean triplicating invite/accept/permission logic. Instead there's one `estate_members` table with a `role` enum. **This is also the table row-level-security policies will key off of** — every other estate-scoped table's RLS policy reduces to "does a row exist in `estate_members` for (this estate, this user) with a role that permits this action." One table, one place to reason about access control. This is flagged because it's a security-relevant structural decision, not just a naming choice — confirm you're comfortable with it before RLS is built on top of it.
2. **`beneficiaries` kept as a distinct table from `estate_members`**, because a beneficiary (someone who *inherits* a specific asset's value) is conceptually different from a member (someone who *administers* the estate) and, critically, a beneficiary often is not and never becomes an AfterVault user at all (e.g., "my daughter" who never signs up). `beneficiaries.linked_user_id` is nullable and only populated if that person happens to also be a platform user.

Everything else below follows the requested table list, expanded where the access-control and legal-requirements modeling required it (`providers`, `legal_requirements` as two tables rather than one, and a join table for closure-request documents).

---

## 1. ER Diagram (ASCII)

```
                                   ┌───────────────┐
                                   │  jurisdictions │
                                   └───────┬────────┘
                                           │ 1
                                           │
                      ┌────────────────────┼─────────────────────┐
                      │ N                                        │ N
              ┌───────┴───────┐                          ┌───────┴────────┐
              │    estates    │                          │legal_requirements│
              └───┬───────┬───┘                          └───────┬─────────┘
                 1│       │1                                     │N
                  │       │                                      │
        ┌─────────┘       └─────────┐                    ┌───────┴───────┐
       N│                          N│                    │   providers   │
┌───────┴────────┐         ┌────────┴─────────┐          └───────┬───────┘
│ estate_members │         │  digital_assets   │──────────────────┘ N:1
└───────┬────────┘         └───┬───────┬───────┘
        │N                    1│      N│
        │                      │       │
        │1              ┌──────┘       └──────┐
   ┌────┴────┐          │N                    │1
   │  users  │   ┌───────┴────────┐   ┌────────┴─────────┐
   └────┬────┘   │digital_vault_  │   │account_closure_  │
        │        │    items       │   │    requests       │
        │        └────────────────┘   └────────┬──────────┘
        │                                       │N
        │                              ┌────────┴─────────────────┐
        │                              │account_closure_request_  │
        │                              │       documents           │
        │                              └────────────┬──────────────┘
        │                                            │N
        │                                     ┌──────┴──────┐
        │                                     │  documents   │
        │                                     └──────────────┘
        │
        │1        ┌───────────────┐     ┌───────────────┐     ┌──────────────┐
        ├────────►│ subscriptions │────►│   payments     │     │ notifications │
        │  N       └───────────────┘  N  └───────────────┘     └──────┬───────┘
        │                                                              │N:1
        │                                                              │
        └──────────────────────────────────────────────────────────────┘
                                     users

        estates ──1:N──► beneficiaries ◄──N:1(nullable)── digital_assets
        (any estate/user-scoped table) ──► audit_logs (append-only, N:1 to users nullable, N:1 to estates nullable)
```

---

## 2. Core Identity & Estate Tables

### 2.1 `users`
Platform accounts. If the eventual auth provider (see Tech Stack doc) supplies its own managed users table (e.g. Supabase's `auth.users`), this becomes a 1:1 profile table keyed on that provider's user id rather than owning password storage itself — noted here so this doc isn't invalidated by that choice.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| email | citext UNIQUE NOT NULL | case-insensitive to avoid duplicate-account confusion |
| display_name | text NOT NULL | |
| mfa_enabled | boolean NOT NULL DEFAULT false | enforced true at app layer for owner/executor roles — see Security Architecture §3 |
| created_at | timestamptz NOT NULL DEFAULT now() | |
| updated_at | timestamptz NOT NULL DEFAULT now() | |
| deleted_at | timestamptz NULL | soft-delete for account closure with undelete grace window (PRD §non-goals doesn't cover this, but retention policy requires it — see Security Architecture §5) |
| public_key | bytea NULL | X25519 public key, generated client-side once per account the first time this person accepts an Executor/Helper nomination on *any* estate — reusable across every estate they're a member of, since a keypair belongs to the account, not a specific membership (Security Architecture §1.4, resolved). Not secret. |
| wrapped_private_key | bytea NULL | the matching X25519 private key, wrapped under this account's own password-derived key (same KDF as the Owner's VK-wrapping key) — never sent or stored in plaintext. |
| kdf_salt | bytea NULL | the single Argon2id salt for this account's password-derived wrapping key, reused for both purposes it ever serves: wrapping this user's own Vault Key copy directly (as an Owner) and/or wrapping `wrapped_private_key` (as an Executor/Helper). |

**Indexes**: unique btree on `email` (lookup on login; uniqueness constraint). btree on `deleted_at` (partial, `WHERE deleted_at IS NOT NULL`) to efficiently sweep for hard-deletion after the grace window.

### 2.2 `jurisdictions`
Reference data. MVP populates US only; table shape supports more without migration.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| country_code | char(2) NOT NULL | ISO 3166-1 alpha-2 |
| region_code | text NULL | state/province code, e.g. `CA`; null = country-level default |
| display_name | text NOT NULL | e.g. "California, United States" |
| is_supported | boolean NOT NULL DEFAULT false | gates whether a Planner can select it at estate creation — lets us seed rows for future jurisdictions before they're launch-ready |

**Indexes**: unique btree on `(country_code, region_code)` — the natural key; a jurisdiction row must be unique per country+region combination, and this also serves as the lookup path when resolving an estate's jurisdiction to its requirement set.

### 2.3 `estates`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| owner_user_id | uuid NOT NULL FK → users(id) | the Planner; ON DELETE RESTRICT — an estate must not be silently orphaned by a user-delete, that has to be a deliberate cascade decision at the app layer |
| jurisdiction_id | uuid NOT NULL FK → jurisdictions(id) | ON DELETE RESTRICT |
| display_name | text NOT NULL | e.g. "Diane's Estate" |
| status | estate_status ENUM NOT NULL DEFAULT 'setup' | `setup, active_living, death_reported, verifying, active_executor, closed` |
| check_in_interval_days | int NOT NULL DEFAULT 90 | dead man's switch cadence, PRD §5 |
| last_check_in_at | timestamptz NOT NULL DEFAULT now() | |
| grace_period_days | int NOT NULL DEFAULT 14 | window after missed check-in before verification escalates, Security Architecture §4 |
| created_at | timestamptz NOT NULL DEFAULT now() | |
| updated_at | timestamptz NOT NULL DEFAULT now() | |
| closed_at | timestamptz NULL | |

**Indexes**: btree on `owner_user_id` (a user's own-estate lookups, e.g. their dashboard). btree on `jurisdiction_id` (admin/reporting queries). btree on `(status, last_check_in_at)` — this is the index the dead-man's-switch background job scans (`WHERE status = 'active_living' AND last_check_in_at < now() - interval`), so it needs to be efficient at scale, not a sequential scan.

### 2.4 `estate_members`
The RBAC backbone — see §0. Also the primary reference for RLS policies (Security Architecture §3).

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| estate_id | uuid NOT NULL FK → estates(id) ON DELETE CASCADE | member rows are meaningless without the estate |
| user_id | uuid NULL FK → users(id) ON DELETE CASCADE | null until invite accepted and the invitee has/creates an account |
| role | member_role ENUM NOT NULL | `owner, executor, helper` |
| invite_email | citext NOT NULL | kept even after acceptance, for audit/history |
| invite_status | invite_status ENUM NOT NULL DEFAULT 'pending' | `pending, accepted, revoked` |
| invited_at | timestamptz NOT NULL DEFAULT now() | |
| accepted_at | timestamptz NULL | |
| fallback_order | int NULL | executor fallback chain (PRD §7 open question — nullable until that's confirmed in scope) |
| wrapped_vault_key | bytea NULL | this member's wrapped copy of the estate's Vault Key (renamed from `wrapped_key_share` — Security Architecture §1.4, resolved). For an `owner` row: the VK wrapped directly under the Owner's own password-derived key. For an `executor` row (primary or Backup, per `fallback_order`): the VK sealed under that member's `users.public_key`. Opaque ciphertext the app never interprets. |
| created_at | timestamptz NOT NULL DEFAULT now() | |

**Indexes**: btree on `estate_id` (every RLS check and every "who's on this estate" query starts here — this is the single most latency-sensitive index in the schema, since it's evaluated on effectively every request touching estate-scoped data). unique btree on `(estate_id, user_id)` WHERE `user_id IS NOT NULL` (a user can't hold two membership rows on the same estate). **Partial unique index on `(estate_id)` WHERE `role = 'owner'`** — enforces exactly one Owner per estate at the database level, not just app logic, because this is a security invariant worth having the database itself guarantee.

---

## 3. Legal Requirements Reference Data

### 3.1 `providers`
Known platforms (Google, Meta, Chase, Coinbase, generic "domain registrar," etc.) — reference data maintained by Platform Admins (PRD §2.4).

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text NOT NULL | |
| default_category | asset_category ENUM NOT NULL | `financial, social, subscription, crypto, cloud_storage, domain, other` — same enum used on `digital_assets.category` |
| website_url | text NULL | |
| notes | text NULL | internal admin notes on quirks (e.g., "Google requires separate content-release process, see legal doc §1.3") |
| created_at / updated_at | timestamptz | |

**Indexes**: btree on `name` (admin search/autocomplete when a Planner is adding an asset and matching it to a known provider).

### 3.2 `legal_requirements`
The configurable checklist engine described in Legal & Compliance §1.3 — **this table is the entire reason the legal domain doesn't get hardcoded into application logic.**

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| jurisdiction_id | uuid NOT NULL FK → jurisdictions(id) ON DELETE RESTRICT | |
| asset_category | asset_category ENUM NOT NULL | |
| provider_id | uuid NULL FK → providers(id) ON DELETE CASCADE | null = generic requirement for this jurisdiction+category with no provider-specific override; non-null = provider-specific override/addition |
| requirement_type | requirement_type ENUM NOT NULL | `death_certificate_certified, death_certificate_copy, letters_testamentary, letters_of_administration, small_estate_affidavit, executor_government_id, notarization, court_order, provider_specific_form` |
| submission_channel | submission_channel ENUM NOT NULL | `online_form, mail, in_person, api` |
| submission_detail | text NULL | URL or mailing address, per channel |
| display_order | int NOT NULL DEFAULT 0 | checklist rendering order |
| effective_date | date NOT NULL DEFAULT CURRENT_DATE | |
| superseded_by_id | uuid NULL FK → legal_requirements(id) | self-referential versioning — when admin content changes (law updates, provider changes process), the old row is superseded rather than mutated in place, because `account_closure_requests.legal_requirement_snapshot` (§4.2) needs history to remain reconstructable |
| created_at / updated_at | timestamptz | |

**Indexes**: btree on `(jurisdiction_id, asset_category, provider_id)` — this is the exact lookup pattern the checklist-generation feature runs (PRD §4.4: "jurisdiction-specific requirement set for bank account, executor with letters testamentary, state = California"). btree on `superseded_by_id` (admin tooling walking version history).

---

## 4. Asset & Vault Tables

### 4.1 `digital_assets`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| estate_id | uuid NOT NULL FK → estates(id) ON DELETE CASCADE | |
| category | asset_category ENUM NOT NULL | |
| provider_id | uuid NULL FK → providers(id) ON DELETE SET NULL | nullable for "other"/unlisted providers |
| custom_provider_name | text NULL | populated when `provider_id` is null |
| account_identifier | text NULL | non-secret metadata only (e.g. masked username, last-4) — never a password; secrets live exclusively in `digital_vault_items` |
| intended_outcome | intended_outcome ENUM NOT NULL DEFAULT 'other' | `close, transfer, memorialize, ignore, other` |
| intended_outcome_notes | text NULL | |
| primary_beneficiary_id | uuid NULL FK → beneficiaries(id) ON DELETE SET NULL | |
| estimated_value_cents | bigint NULL | for financial/crypto assets |
| currency | char(3) NULL | ISO 4217 |
| created_at / updated_at | timestamptz | |
| archived_at | timestamptz NULL | soft-remove without breaking closure-request history |

**Indexes**: btree on `estate_id` (every asset-inventory list query and every RLS check). btree on `(estate_id, category)` (dashboard filtering by category, PRD §4.5). btree on `provider_id` (used when resolving `legal_requirements` for a given asset).

### 4.2 `digital_vault_items` — 🔒 Security-Sensitive
Zero-knowledge encrypted secret storage. **The server never stores or handles plaintext.** See Security Architecture §1 for the full encryption design; this table only stores what the design produces.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| digital_asset_id | uuid NOT NULL FK → digital_assets(id) ON DELETE CASCADE | |
| item_type | vault_item_type ENUM NOT NULL | `password, recovery_code, security_question, note, seed_phrase, other` |
| ciphertext | bytea NOT NULL | client-encrypted payload |
| encryption_iv | bytea NOT NULL | initialization vector/nonce, unique per item |
| wrapped_data_key | bytea NOT NULL | the item's data-encryption-key, wrapped under the estate's vault key — never the plaintext key |
| key_version | int NOT NULL DEFAULT 1 | supports future key-rotation without a data migration |
| created_at / updated_at | timestamptz | |

**Indexes**: btree on `digital_asset_id` (the only access pattern this table needs — items are always fetched in the context of their asset, never searched by content, since content is opaque ciphertext). **No index on any content column, deliberately** — there is nothing in this table indexable without defeating the zero-knowledge property.

### 4.3 `beneficiaries`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| estate_id | uuid NOT NULL FK → estates(id) ON DELETE CASCADE | |
| digital_asset_id | uuid NULL FK → digital_assets(id) ON DELETE SET NULL | null = estate-wide/residual beneficiary rather than asset-specific |
| display_name | text NOT NULL | |
| relationship | text NULL | e.g. "daughter" — free text, not modeled as an enum since relationship terms vary too much to enumerate usefully |
| contact_email | citext NULL | |
| linked_user_id | uuid NULL FK → users(id) ON DELETE SET NULL | populated only if this beneficiary independently is/becomes a platform user |
| notes | text NULL | |
| created_at | timestamptz | |

**Indexes**: btree on `estate_id`. btree on `digital_asset_id` (asset-detail view showing its designated beneficiary).

---

## 5. Documents & Closure Requests

### 5.1 `documents`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| estate_id | uuid NOT NULL FK → estates(id) ON DELETE CASCADE | |
| uploaded_by_user_id | uuid NOT NULL FK → users(id) ON DELETE RESTRICT | preserve provenance even if uploader account is later deleted |
| document_type | document_type ENUM NOT NULL | `death_certificate, letters_testamentary, letters_of_administration, small_estate_affidavit, executor_government_id, notarized_affidavit, other` |
| storage_path | text NOT NULL | opaque reference into blob storage (see Tech Stack doc) — never a raw filesystem path |
| file_name | text NOT NULL | |
| mime_type | text NOT NULL | |
| file_size_bytes | bigint NOT NULL | |
| is_certified_original | boolean NOT NULL DEFAULT false | relevant per Legal & Compliance §1.1 — some providers require certified originals, not scans |
| notes | text NULL | |
| uploaded_at | timestamptz NOT NULL DEFAULT now() | |

**Indexes**: btree on `estate_id` (upload-once-reuse-many pattern from PRD §4.4 — every "attach an existing document" picker queries this). btree on `(estate_id, document_type)` (checklist auto-suggest: "you already have a death certificate on file").

### 5.2 `account_closure_requests`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| digital_asset_id | uuid NOT NULL FK → digital_assets(id) ON DELETE CASCADE | |
| estate_id | uuid NOT NULL FK → estates(id) ON DELETE CASCADE | denormalized from `digital_asset_id`'s estate — deliberate, so RLS policies and the estate-wide status dashboard (PRD §4.5) don't require a join through `digital_assets` on every read |
| status | closure_status ENUM NOT NULL DEFAULT 'not_started' | `not_started, documents_gathered, submitted, in_progress, resolved, rejected, needs_attention, out_of_scope` |
| assigned_to_user_id | uuid NULL FK → users(id) ON DELETE SET NULL | usually the executor |
| legal_requirement_snapshot | jsonb NOT NULL | frozen copy of the checklist that applied when this request was created — deliberately denormalized so later edits to `legal_requirements` reference data don't silently rewrite an in-progress request's checklist out from under the executor |
| last_status_change_at | timestamptz NOT NULL DEFAULT now() | drives the stale-request reminder job, PRD §5 |
| resolved_at | timestamptz NULL | |
| created_at / updated_at | timestamptz | |

**Indexes**: btree on `estate_id` (dashboard list, PRD §4.5). btree on `digital_asset_id` (asset-detail view). btree on `(status, last_status_change_at)` — the stale-request reminder background job's scan pattern (`WHERE status IN ('submitted','in_progress') AND last_status_change_at < now() - interval`), same rationale as the `estates` check-in index in §2.3.

### 5.3 `account_closure_request_documents`
Join table — one death certificate reused across many requests (PRD §4.4).

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| account_closure_request_id | uuid NOT NULL FK → account_closure_requests(id) ON DELETE CASCADE | |
| document_id | uuid NOT NULL FK → documents(id) ON DELETE CASCADE | |
| attached_at | timestamptz NOT NULL DEFAULT now() | |

**Indexes**: unique btree on `(account_closure_request_id, document_id)` (prevents duplicate attachment, also serves as the lookup index for "what's attached to this request"). btree on `document_id` (reverse lookup: "what requests is this document attached to," needed for the reuse-picker UI).

---

## 6. Audit, Notifications, Billing

### 6.1 `audit_logs` — 🔒 Security-Sensitive, append-only
Every vault access, every membership change, every status-affecting action. Enforced append-only via RLS/trigger (no UPDATE or DELETE grants at the DB role level) — detailed in Security Architecture §3.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| estate_id | uuid NULL FK → estates(id) ON DELETE SET NULL | null for non-estate-scoped events (e.g., login) |
| actor_user_id | uuid NULL FK → users(id) ON DELETE SET NULL | null for system-triggered events (e.g., automated dead-man's-switch escalation) |
| event_type | text NOT NULL | e.g. `vault_item_viewed`, `vault_item_created`, `closure_request_status_changed`, `death_reported`, `member_invited`, `key_recovery_used` |
| target_table | text NULL | |
| target_id | uuid NULL | |
| metadata | jsonb NULL | event-specific detail |
| ip_address | inet NULL | |
| created_at | timestamptz NOT NULL DEFAULT now() | |

**Indexes**: btree on `(estate_id, created_at)` (per-estate audit trail view, most common admin/dispute-resolution query). btree on `(actor_user_id, created_at)` (per-user activity view). btree on `event_type` (filtering by event class, e.g. all `vault_item_viewed` events for a security review). **No FK cascade deletes** on `estate_id`/`actor_user_id` — `ON DELETE SET NULL` rather than `CASCADE`, deliberately, because audit history must survive the deletion of the thing it's auditing (this is the one table in the schema where losing the estate or the user must not lose the log).

### 6.2 `notifications`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid NOT NULL FK → users(id) ON DELETE CASCADE | |
| estate_id | uuid NULL FK → estates(id) ON DELETE CASCADE | null for account-level notifications (e.g. billing) |
| notification_type | text NOT NULL | |
| channel | notification_channel ENUM NOT NULL | `email, sms, in_app` |
| status | notification_status ENUM NOT NULL DEFAULT 'pending' | `pending, sent, failed` |
| payload | jsonb NOT NULL | |
| sent_at | timestamptz NULL | |
| created_at | timestamptz NOT NULL DEFAULT now() | |

**Indexes**: btree on `(user_id, created_at)` (in-app notification list). btree on `(status)` WHERE `status = 'pending'` (partial index — the send-queue worker's scan target, kept small since most rows quickly move out of `pending`).

### 6.3 `subscriptions`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid NOT NULL FK → users(id) ON DELETE RESTRICT | Planners only, per PRD §3.1 — Executors don't have subscriptions |
| plan | text NOT NULL | |
| status | subscription_status ENUM NOT NULL | `trialing, active, past_due, canceled` |
| external_customer_id | text NOT NULL | payment provider's customer reference |
| external_subscription_id | text NOT NULL | |
| current_period_end | timestamptz NOT NULL | |
| created_at / updated_at | timestamptz | |

**Indexes**: unique btree on `user_id` (one active subscription per Planner, MVP simplification). unique btree on `external_subscription_id` (webhook reconciliation lookup from the payment provider).

### 6.4 `payments`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| subscription_id | uuid NOT NULL FK → subscriptions(id) ON DELETE CASCADE | |
| amount_cents | int NOT NULL | |
| currency | char(3) NOT NULL | |
| status | payment_status ENUM NOT NULL | `succeeded, failed, refunded` |
| external_payment_id | text NOT NULL | |
| created_at | timestamptz NOT NULL DEFAULT now() | |

**Indexes**: btree on `subscription_id` (billing history view). unique btree on `external_payment_id` (idempotent webhook processing — payment providers retry webhook delivery, this is the dedup key).

---

## 7. Cross-Cutting Notes

- **Every estate-scoped table carries `estate_id` directly** (even where it could be derived transitively through a join, e.g. `account_closure_requests` through `digital_assets`) specifically so RLS policies stay single-hop: `estate_id IN (SELECT estate_id FROM estate_members WHERE user_id = auth.uid())`-shaped, not multi-join. This is a deliberate denormalization trade (a little redundant storage and a little write-time bookkeeping) for RLS policies that stay auditable by inspection — see Security Architecture §3 for why that matters for a table like this.
- **All money fields are `_cents`/integer, never floating point**, standard financial-data practice.
- **All enums are Postgres native `ENUM` types**, not free-text with app-layer validation, so an invalid state is a constraint violation, not a silent bad write.
- **`ON DELETE` behavior is chosen per-relationship, not defaulted to CASCADE everywhere** — audit logs and documents in particular are designed to outlive the things they reference, which matters for both the retention requirements in Legal & Compliance §3 and for dispute resolution.
