# AfterVault — API Specification (High-Level, OpenAPI-Style)

Status: Draft v1 — for founder review. This is a high-level resource/endpoint spec, not a full OpenAPI YAML document — sufficient to drive route-handler scaffolding and RLS-policy design; a formal OpenAPI file can be generated from the actual implementation once routes exist, rather than hand-maintained in parallel.

**Auth conventions used below:**
- `Session` = any authenticated user (valid Supabase Auth session).
- `Role: X` = additionally requires an `estate_members` row for the target estate with role X (or higher — `owner` implicitly satisfies anything `executor`/`helper` can do on their own estate while it's in `active_living`).
- `Admin` = platform admin role, non-estate-scoped.
- `Public` = no auth (rare — invite-acceptance landing only).
- All estate-scoped endpoints additionally enforce the RLS policy described in Database Schema §7/Security Architecture §3.2 at the database layer — the auth column below states the *application-layer* gate; the database layer is a second, independent enforcement of the same boundary, not documented per-endpoint here since it's uniform.

---

## 1. Auth & Account

Supabase Auth handles the underlying primitives (signup, login, session refresh, MFA enrollment/challenge, password reset) directly — these are not custom Route Handlers and are intentionally omitted from this spec since they're SDK-driven, not application API surface we design. Endpoints below are the application-specific wrappers.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/me` | Session | Current user profile + list of estates they're a member of (with role per estate) |
| PATCH | `/api/me` | Session | Update display name, notification preferences |
| DELETE | `/api/me` | Session | Soft-delete account (Security Architecture §5) |

## 2. Estates

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/estates` | Session | Create an estate (becomes `owner` via an `estate_members` row created in the same transaction). Body: `jurisdiction_id`, `display_name`, `check_in_interval_days?` |
| GET | `/api/estates/:id` | Role: any | Estate detail — status, readiness-score inputs, jurisdiction |
| PATCH | `/api/estates/:id` | Role: owner | Update display name, check-in interval, grace period (only while `status = 'active_living'` or `'setup'`) |
| POST | `/api/estates/:id/check-in` | Role: owner | Resets `last_check_in_at`. This is the dead-man's-switch heartbeat (Security Architecture §4.1) |
| GET | `/api/estates/:id/readiness-score` | Role: owner | Computed: % assets with instructions set, executor confirmed, MFA enabled, death-cert-contact configured (PRD §4.1) |
| POST | `/api/estates/:id/close` | Role: executor | Only when all `account_closure_requests` are `resolved`/`out_of_scope` (PRD §4.5) |

## 3. Estate Members (Owner/Executor/Helper)

🔒 Security-sensitive — touches the RBAC/key-recovery model directly (Security Architecture §1, §3.2).

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/estates/:id/members` | Role: any | List members and roles (not their key material) |
| POST | `/api/estates/:id/members/invite` | Role: owner | Body: `invite_email`, `role` (`executor`\|`helper`), `fallback_order?`. Sends invite email via Resend |
| POST | `/api/invites/:token/accept` | Public → Session on completion | Invitee lands here from email; creates/links their `users` row, creates their asymmetric keypair client-side, uploads only their **public** key. Public because the invitee may not have an account yet — the invite token itself is the credential, single-use, expiring |
| POST | `/api/estates/:id/members/:memberId/wrap-key-share` | Role: owner | Called by the Owner's client after a member's public key becomes available; uploads `VK wrapped under that member's public key` (Security Architecture §1.1). Server stores opaquely, cannot decrypt or inspect |
| DELETE | `/api/estates/:id/members/:memberId` | Role: owner | Revoke membership (sets `invite_status = 'revoked'`; does not retroactively invalidate a key share already distributed — noted as a known limitation, not silently glossed over, since true revocation of a wrapped key already unwrapped client-side isn't cryptographically enforceable after the fact) |

## 4. Death Reporting & Verification Workflow

🔒 Security-sensitive — this is the state machine in Security Architecture §4.

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/estates/:id/report-death` | Role: executor or helper | Files a report; moves `status` → `death_reported` → `verifying`; triggers multi-channel notice to the Owner |
| POST | `/api/estates/:id/self-cancel` | Role: owner | Only valid while `status = 'verifying'` and within the self-cancel window; reverts to `active_living`, resets `last_check_in_at`, logs `false_positive_cancelled` audit event |
| GET | `/api/estates/:id/verification-status` | Role: any member | Current stage, whether self-cancel window is still open, whether a death certificate has been attached |
| POST | `/api/estates/:id/verification/documents` | Role: executor or helper | Attach a `death_certificate`-typed document (reuses `/api/estates/:id/documents` upload, referenced here since it's the specific action that unlocks the next stage) |
| GET | `/api/estates/:id/key-recovery` | Role: executor | Only servable when `status = 'active_executor'` — returns the Executor's wrapped VK copy and wrapped private key material. This is the single most access-controlled read in the API; see Security Architecture §1.2 |

## 5. Digital Assets

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/estates/:id/assets` | Role: any (Helper sees non-vault fields only) | List, filterable by `category`, `archived` |
| POST | `/api/estates/:id/assets` | Role: owner | Create. Body: `category`, `provider_id?`, `custom_provider_name?`, `account_identifier?`, `intended_outcome`, etc. |
| GET | `/api/estates/:id/assets/:assetId` | Role: any (Helper sees non-vault fields only) | Detail, including its `legal_requirements` checklist resolved via §8 below |
| PATCH | `/api/estates/:id/assets/:assetId` | Role: owner (pre-death), executor (post-death, limited fields) | |
| DELETE | `/api/estates/:id/assets/:assetId` | Role: owner | Soft-delete (`archived_at`), never hard-delete while any `account_closure_requests` reference it |

## 6. Vault Items 🔒 Security-Sensitive

Server never sees plaintext — every request body/response here carries ciphertext + wrapping metadata only (Security Architecture §1). Route handlers for this resource do not deserialize or log request bodies beyond what's needed for storage, precisely because logging middleware is exactly the kind of thing that could accidentally leak ciphertext-adjacent metadata if not deliberately scoped.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/estates/:id/assets/:assetId/vault-items` | Role: owner (pre-death) or executor (only once `status = 'active_executor'` AND key-recovery completed) | Returns ciphertext, IV, wrapped DEK — never plaintext |
| POST | `/api/estates/:id/assets/:assetId/vault-items` | Role: owner | Body: `item_type`, `ciphertext`, `encryption_iv`, `wrapped_data_key`, `key_version`. All produced client-side |
| PATCH | `/api/.../vault-items/:itemId` | Role: owner | Replace ciphertext (e.g., password rotation) |
| DELETE | `/api/.../vault-items/:itemId` | Role: owner | |

Explicitly **no** `helper` access to any vault-items route, per PRD §2/§4.1 — Helper role is view-only on closure-request status.

## 7. Beneficiaries

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/estates/:id/beneficiaries` | Role: any | |
| POST | `/api/estates/:id/beneficiaries` | Role: owner | Body: `display_name`, `relationship?`, `contact_email?`, `digital_asset_id?` (null = estate-wide) |
| PATCH / DELETE | `/api/estates/:id/beneficiaries/:beneficiaryId` | Role: owner | |

## 8. Legal Requirements & Providers (read-only for regular users; admin-managed content)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/legal-requirements` | Role: any (estate context implied) | Query params: `jurisdiction_id`, `asset_category`, `provider_id?`. Returns the checklist that `account_closure_requests.legal_requirement_snapshot` will freeze a copy of at request-creation time (Database Schema §5.2) |
| GET | `/api/providers` | Session | Search/autocomplete for asset creation (Database Schema §3.1) |
| GET | `/api/jurisdictions` | Public | Populated jurisdictions only (`is_supported = true`) — used by the estate-creation jurisdiction picker |
| POST/PATCH | `/api/admin/legal-requirements` | Admin | Content management; writes go through the versioning pattern (`superseded_by_id`) rather than in-place mutation (Database Schema §3.2) |
| POST/PATCH | `/api/admin/providers` | Admin | |
| POST/PATCH | `/api/admin/jurisdictions` | Admin | |

## 9. Documents

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/estates/:id/documents` | Role: owner or executor | List, for the reuse-picker (PRD §4.4) |
| POST | `/api/estates/:id/documents` | Role: owner or executor | Multipart upload → Supabase Storage; creates `documents` row with `storage_path` |
| GET | `/api/estates/:id/documents/:docId` | Role: owner or executor | Signed/short-lived download URL, never a public storage URL |
| DELETE | `/api/estates/:id/documents/:docId` | Role: owner or executor | Only if not attached to any `account_closure_requests` — otherwise reject with a clear error, don't silently orphan a closure request's evidence |

## 10. Account Closure Requests

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/estates/:id/closure-requests` | Role: any (Helper sees status only, not underlying asset vault link) | Filterable by `status`, `category` (PRD §4.5) |
| POST | `/api/estates/:id/assets/:assetId/closure-requests` | Role: executor | Creates the request and snapshots the current `legal_requirements` checklist into `legal_requirement_snapshot` |
| PATCH | `/api/.../closure-requests/:requestId` | Role: executor | Status transitions, `assigned_to_user_id` |
| POST | `/api/.../closure-requests/:requestId/documents` | Role: executor | Attach an existing `documents` row (join table, Database Schema §5.3) |

## 11. Notifications

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/notifications` | Session | Current user's in-app notification list |
| PATCH | `/api/notifications/:id/read` | Session | |

(Email/SMS sends themselves are triggered server-side by background jobs, not by client-facing endpoints — see Development Roadmap for the scheduled-function design.)

## 12. Billing

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/billing/checkout-session` | Session | Creates a Stripe Checkout session for a Planner subscribing |
| POST | `/api/billing/portal-session` | Session | Stripe Billing Portal link for self-serve plan management |
| POST | `/api/webhooks/stripe` | Stripe signature verification (not user session) | Reconciles `subscriptions`/`payments` from Stripe webhook events |

## 13. Audit Log Access (read-only, no write endpoint — writes happen only as a side effect of other actions)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/estates/:id/audit-log` | Role: owner or executor | Paginated, filterable by `event_type`, date range — the dispute-resolution/trust-building view referenced in Security Architecture §3.3 |

---

## Notes on What's Deliberately Not an Endpoint

- No endpoint ever accepts or returns plaintext vault content — client-side encryption/decryption means the API surface for vault items is ciphertext-in, ciphertext-out, by construction (§6).
- No "admin override" endpoint exists for vault access, for any role — consistent with Security Architecture §1.3's explicit design limitation that there is no server-side master key.
