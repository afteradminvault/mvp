# AfterVault — Security Architecture

Status: **Draft v1 — proposed design, not yet approved.** Per our own process rule: §1 (zero-knowledge vault + executor key-recovery) is the hardest and least-reversible technical decision in the system and must get your explicit, separate sign-off before any vault code is written — this document proposes a design for that review, it does not authorize implementation on its own.

---

## 1. Zero-Knowledge Vault Design

**Goal**: the server (and anyone with database access — including us, including a subpoena, including a breach) must never be able to see plaintext vault contents. All encryption/decryption happens client-side, in the browser, using keys the server never possesses.

### 1.1 Key hierarchy (envelope encryption)

Three layers, generated and combined client-side only:

1. **Data Encryption Key (DEK)** — one randomly-generated AES-256 key *per vault item* (`digital_vault_items` row). The DEK encrypts that single item's content (AES-256-GCM, which gives both confidentiality and integrity/tamper-detection).
2. **Vault Key (VK)** — one key *per estate*, generated once client-side when the Planner creates their first vault item. Every item's DEK is wrapped (encrypted) under the VK before either the DEK or the ciphertext is sent to the server. The VK itself never leaves the client in plaintext, ever, under any circumstance — this is the single key whose lifecycle this whole design exists to protect.
3. **Wrapping keys** — per-person keys used only to wrap/unwrap a *copy* of the VK, one per person who needs eventual access:
   - **Owner wrapping key**: derived client-side from the Planner's account password via a memory-hard KDF (Argon2id, recommended parameters tuned at implementation time for target hardware). `estates` (or a dedicated column — see §1.4 open item) stores `VK encrypted under owner-wrapping-key`. This is how the Planner unlocks their own vault every session.
   - **Executor/Helper wrapping keys**: at invite-acceptance time, the invitee's client generates an asymmetric keypair (e.g., X25519) *on their own device*. The **public** key is sent to the server and stored (`estate_members.wrapped_key_share` — see note below on why this column name needs a slight adjustment, §1.4). The **private** key never leaves their device in plaintext — it's itself wrapped under a KDF derived from their own account password, same pattern as the Owner. The next time the Planner's client is online after a new member accepts, it fetches that member's public key, wraps a copy of the VK under it, and uploads `VK encrypted under [member]'s public key`. The server now holds one wrapped copy of the VK per person who should eventually have access — none of them decryptable without a private key that lives only on that person's device (protected by their own password).

**Net effect**: the server at all times holds only ciphertext and wrapped keys. Decrypting anything requires a private key or password that only exists client-side, on a specific person's device/account. This holds for vault item content specifically — item *metadata* (which asset it belongs to, when it was created) is not secret and is stored in plaintext, as designed in Database Schema §4.2.

### 1.2 Executor access after death (the key-recovery step)

1. Death verification completes (§4 below) and `estates.status` flips to `active_executor`.
2. The Executor's client fetches their wrapped copy of the VK (`VK encrypted under Executor's public key`) and their own wrapped private key.
3. Client-side: Executor enters their account password → derives their KDF wrapping key → unwraps their private key → uses their private key to unwrap the VK → VK is now available client-side, in memory, for this session only.
4. Client fetches each `digital_vault_items` row, unwraps each item's DEK using VK, decrypts each item's ciphertext using its DEK. Plaintext exists only transiently in the Executor's browser memory, never persisted, never sent back to the server.

**The server's role in this entire flow is purely to store and serve opaque blobs and to gate *when* it will serve the executor's wrapped VK copy** (i.e., app-layer authorization still enforces "don't even return this row unless `estates.status = 'active_executor'`" as defense-in-depth — the cryptography doesn't depend on that gate, but a real system should not skip a cheap additional control just because the crypto is sound).

### 1.3 Known limitations — flagging honestly rather than glossing over them

- **A lost device/forgotten password on the Executor's side before death is unrecoverable by design.** If the Executor never logs in again after accepting the invite and loses their password with no recovery method, their wrapped private key is permanently unusable, and that copy of VK access is lost. Mitigation options to evaluate at your approval review: (a) require the Executor to also configure their own account-recovery method (this is standard account recovery, not vault recovery — it protects their login, and re-establishing login lets them re-derive their wrapping key as long as the underlying key material used a recoverable KDF path, which needs care to not become a backdoor); (b) support wrapping the VK for **multiple** people (Owner + primary Executor + Helper, or an M-of-N Shamir's Secret Sharing split across executor + helper + a neutral third party) so no single lost credential is fatal. **This document does not commit to (b)'s complexity for MVP — flagging it as the main open design question for your review**, since it's the actual hard tradeoff: true zero-knowledge means we cannot offer a "forgot password, here's your vault back" support flow the way a normal SaaS product would, and redundancy (multiple wrapped copies) is the only lever available.
- **If the Planner never adds an Executor before death (or the sole Executor is unreachable), the vault is permanently unrecoverable** — there is no server-side master key, by design, so there is no "admin override" path. This must be surfaced prominently in the Planner UX (readiness score in PRD §4.1 already reflects "executor confirmed" — this is *why* that's not a cosmetic checklist item) and in Terms of Service.
- **Password changes**: when the Owner changes their password, their client must re-derive the new wrapping key and re-wrap their stored VK copy — this needs to happen atomically at the app layer (re-wrap before confirming the password change succeeded) or the Owner's own copy could be bricked. Executor/Helper copies are unaffected by the Owner's password change since each wrapping key is independent.

### 1.4 Open items for your approval review — RESOLVED

Resolved during Milestone 1 feature 1's review checkpoint; original reasoning kept below for context, resolution noted inline.

1. **Redundancy model**: single Executor wrapped copy (simplest, matches MVP's "one nominated Executor" scope) vs. multi-party wrapping (Owner + Executor + Helper each get an independent wrapped VK copy — helper access to vault is currently scoped as view-only-on-status per PRD §2, so a Helper copy would need a scope decision: do Helpers get vault decrypt capability post-death, or only closure-request visibility?). **Recommendation: start with Owner + primary Executor + one designated Backup Executor (the `fallback_order` column already in the schema), skip Shamir splitting for MVP** — it's the smallest design that avoids total loss on one lost device, without the added complexity of secret-sharing math and UX for a small team to ship correctly on the first attempt.
   - **RESOLVED: recommendation adopted as-is.** Owner + primary Executor + Backup Executor (both `role = 'executor'`, distinguished by `fallback_order`) each get an independent wrapped VK copy. Helper gets none — no vault decrypt path, matching §3.1.
2. **KDF parameter selection and exact primitive choices** (Argon2id parameters, AES-GCM vs. XChaCha20-Poly1305) — implementation-level detail, but worth deciding alongside this review since it affects the client-side crypto library choice (see Tech Stack doc).
   - **RESOLVED: Argon2id at OPSLIMIT_MODERATE/MEMLIMIT_MODERATE; XChaCha20-Poly1305, not AES-256-GCM.** AES-256-GCM via libsodium is hardware-acceleration-only and unreliable in-browser via WASM; XChaCha20-Poly1305's 192-bit random nonce carries no meaningful collision risk given every item is encrypted independently client-side with no central nonce counter. Implemented in `src/crypto/`.
3. **`estate_members.wrapped_key_share` column naming** — Database Schema currently names this column as if it holds one thing; per the design above it actually needs to hold *both* the member's public-key-wrapped VK copy *and* reference their own wrapped-private-key material (which could arguably live on the `users` table instead, since a private key is tied to the person's device/account, not to a specific estate membership). **This is a real schema adjustment this review should resolve, not a cosmetic naming nitpick** — flagging it here rather than silently patching the schema doc without your sign-off, since you asked for this design to be reviewed as its own artifact.
   - **RESOLVED: renamed to `estate_members.wrapped_vault_key`**, used uniformly for every role that gets a VK copy (Owner's own direct wrap included). Added `users.public_key`, `users.wrapped_private_key`, `users.kdf_salt` for the account-level (not membership-level) keypair. Migration: `supabase/migrations/20260721000000_vault_key_hierarchy_columns.sql`.

---

## 2. Encryption at Rest & in Transit, Key Management

- **In transit**: TLS 1.2+ enforced everywhere (HSTS), no exceptions, including internal service-to-service calls once/if the architecture has more than one service.
- **At rest, vault content specifically**: already zero-knowledge per §1 — "at rest" protection for vault ciphertext is almost a secondary concern since the database never held plaintext to begin with, but the ciphertext columns should still sit on an encrypted-at-rest database volume as defense-in-depth (protects against, e.g., a stolen physical disk, orthogonal to the application-layer zero-knowledge property).
- **At rest, everything else** (documents, non-secret metadata, audit logs): standard encryption-at-rest via the hosting/database provider's managed disk encryption. Uploaded documents (death certificates, letters testamentary — see Database Schema §5.1) are **not** zero-knowledge-encrypted like vault items, because executors, and potentially platform support for dispute resolution, need to view them as part of the actual workflow — these are protected by encryption-at-rest + strict access control (§3), not client-side encryption. This asymmetry (vault = zero-knowledge, documents = access-controlled-but-server-readable) is a deliberate product decision worth your awareness: it means a document upload is a lower-assurance secret than a vault item, and Planners/Executors should never be told to put credentials into a document upload as a substitute for the vault.
- **Key management for platform-level keys** (as opposed to per-user vault keys, which are the users' own and never touch our infrastructure): use a managed secrets/KMS service (see Tech Stack doc for the specific provider) for API keys, database credentials, and email/payment provider secrets. Rotate on a defined schedule and immediately on suspected compromise. No secrets in source control, ever — enforced via a pre-commit/CI secret-scanning gate (see Deployment Plan, once written).

## 3. MFA, Role-Based Access Control, Audit Logging

### 3.1 MFA
- **Required, not optional, for the `owner` and `executor` roles** on `estate_members` — these are the two roles with any path to vault access (direct for Owner, eventual for Executor), so account takeover of either role is a vault-compromise risk even with zero-knowledge encryption protecting content-at-rest, because MFA is what protects the *session* in which the client legitimately holds decrypted plaintext in memory.
- Recommend TOTP (authenticator app) as the baseline required factor; SMS-based MFA is weaker (SIM-swap risk) and should be offered only as a fallback/recovery factor, not the primary one, if offered at all.
- `helper` role: MFA strongly encouraged, not enforced at MVP — Helpers have no vault access path (view-only on closure-request status per PRD §2), so the blast radius of a compromised Helper account is lower. Revisit if Helper permissions ever expand.

### 3.2 RBAC
Roles are `estate_members.role` values, enforced at two layers (defense-in-depth, not redundant-for-no-reason):
- **Database layer (RLS)**: every estate-scoped table's row-level security policy resolves through `estate_members` (Database Schema §7) — a user can only read/write rows for estates where they hold a membership row, and further restricted by role within that (e.g., only `owner` can write `digital_assets` while `estates.status = 'active_living'`; only after `active_executor` can the `executor` role write `account_closure_requests`).
- **Application layer**: mirrors the DB policy for defense-in-depth and for cases RLS can't express cleanly (e.g., "vault items are only servable once `estates.status = 'active_executor'`" — RLS can check status via a join, but the *key-release* gating in §1.2 is inherently an app-layer concern since it's about when to hand back a specific wrapped blob, not just row visibility).
- **Platform Admin** is a separate, non-estate-scoped role (not a row in `estate_members` — it manages `providers`/`legal_requirements`/`jurisdictions` reference data and has explicit, logged, narrowly-scoped support access to non-vault estate data for escalations). Admins have **no access path to vault plaintext** — zero-knowledge encryption means this isn't even a permission we could grant if we wanted to, which is a meaningful trust claim worth stating plainly to users.

### 3.3 Audit logging
- Every vault-related read (fetching ciphertext, fetching a wrapped key/key share) and every write (creating/updating a vault item, membership change, closure-request status change, document upload, death report, key-recovery event) is written to `audit_logs` (Database Schema §6.1) — actor, timestamp, IP, event type, target.
- `audit_logs` is **append-only at the database role level** — the application's database role has `INSERT` but not `UPDATE`/`DELETE` grants on this table, enforced by Postgres privileges, not just application discipline. This matters specifically because audit logs are the evidence trail for exactly the kind of dispute this product is likely to face (e.g., "who accessed the vault and when," relevant to Legal & Compliance §1.4 UPL/liability concerns and to family disputes over estate administration).
- Audit logs record *that* an authorized fetch of ciphertext/wrapped-key material happened — they cannot record whether decryption actually succeeded client-side, since the server never sees the result. This is a correct and expected limitation of the zero-knowledge design, not a gap to "fix."

## 4. Dead Man's Switch / Death-Verification Workflow

### 4.1 State machine

```
active_living ──(check-in interval elapses, no check-in)──► checkin_overdue
     ▲                                                             │
     │ check-in received                                (grace_period_days elapses)
     │                                                             │
     └─────────────────────────────────────────────────────────────
                                                                    ▼
active_living ◄──(self-cancel within window)── verifying ◄──(report filed)── death_reported
                                                    │                              ▲
                                        (window lapses, no cancel)                 │
                                                    ▼                    executor/helper files
                                       awaiting_death_certificate            proactive report
                                                    │
                                    (certified death certificate document attached)
                                                    ▼
                                             active_executor ──(all closure requests resolved)──► closed
```

Two entry points into the verification pipeline, both converge on the same gated path — **there is no route to `active_executor` that skips the death-certificate requirement**, including the automated check-in-based trigger. The automated path detects *possible* death from inactivity; it never asserts death on its own.

### 4.2 Failure mode: false positive (living person reported/detected as deceased)

This is the failure mode explicitly called out in scope, and the one the design biases hardest against:

- **Reporting is restricted to nominated `estate_members`** (executor/helper), not open to arbitrary users — narrows the false-positive surface to people the Planner already explicitly trusted, which doesn't eliminate malicious-insider risk but rules out random targeting.
- **Multi-channel notice to the Planner** (email + SMS if a phone number is on file) fires immediately on entering `verifying`, with a **self-cancel window** (recommend defaulting to 7 days, longer than the PRD's illustrative examples suggest, specifically to cover a Planner who is alive but slow to respond — e.g., traveling) during which the Planner logging in and confirming they're alive immediately reverts the estate to `active_living` and resets `last_check_in_at`.
- **Self-cancel is cheap and fast; progressing past it is expensive and slow** — this asymmetry is the core design principle. After the window lapses, the system does not grant executor access on report + timeout alone; it requires a **certified death certificate document** to be attached before `active_executor` is reachable. A death certificate is issued by a government vital records office and is not something available for a living person — this is the actual hard gate against false positives surviving past the self-cancel window, not just a UX nicety.
- Every step (report filed, notice sent, self-cancel used or window lapsed, document attached, status change) is written to `audit_logs`, giving a full trail if a false positive does occur and needs to be investigated/disputed after the fact.
- **Honest limitation**: a Planner who is alive but genuinely unreachable for the entire self-cancel window (hospitalized without device/phone access, no signal, incapacitated but not deceased) is not fully protected by this design — the system will eventually require a death certificate, which a malicious reporter cannot forge, but a Planner in this state also can't self-cancel. This is a real edge case, not fully solved at MVP scope; flagging it rather than implying false-positive protection is airtight. A longer default grace/self-cancel window is the main lever available without adding a second-confirmer requirement (a Phase 2 candidate for high-sensitivity estates, per Database Schema — the schema doesn't preclude adding a second-confirmation requirement later).

### 4.3 Failure mode: false negative (real death goes undetected)

- Backstopped by the automated check-in trigger even with zero human reports — but this only works if `check_in_interval_days` + `grace_period_days` is short enough to matter and the Planner actually engages with check-in reminders while alive.
- **Genuine gap to name explicitly**: if a Planner has zero estate_members who would ever notice or report their death, and check-in reminders go unanswered, the system correctly falls through to the automated path — but there is no path at all if the Planner also never configured an Executor in the first place. Mitigating this is a UX/onboarding problem (PRD §4.1's readiness score already treats "executor confirmed" as a completion signal) more than a security-architecture one.

### 4.4 Failure mode: compromised estate_member account

- An attacker who compromises an Executor's *account* (not their private key material, which is separately protected — §1) could file a false death report. This is exactly the scenario §4.2's self-cancel window and death-certificate gate defend against — the report alone never grants access. MFA on the `executor` role (§3.1) is the primary control preventing the account compromise itself.

## 5. Data Retention & Deletion Policy per Jurisdiction

Builds on Legal & Compliance §3, which flags exact retention *periods* as needing counsel review (🚩) — this section defines the *mechanism*, which is decidable now independent of the exact numbers.

- **Living Planner, active account**: full read/write/delete access to their own data at any time. Account deletion triggers a soft-delete (`users.deleted_at`) with a grace/undelete window (length TBD, standard SaaS pattern, not security-critical), after which a hard-delete job purges vault items, documents, and PII — **except** `audit_logs`, which are retained per the schedule below regardless of account deletion, specifically because audit history needs to survive the thing it's auditing (Database Schema §6.1's `ON DELETE SET NULL` design already supports this).
- **Closed estate** (`estates.status = 'closed'`): documents and closure-request records retained for a period 🚩 counsel must confirm (Legal & Compliance §3 flags this as needing a defensible minimum, likely multi-year, tied to relevant statutes of limitations for probate/estate disputes) before becoming eligible for deletion. Vault items tied to a closed estate should be deletable sooner than documents, since their operational purpose (granting access) ends once the estate is closed — recommend vault-item deletion eligibility on a shorter timeline than document retention, but this split also needs 🚩 counsel confirmation before being finalized as policy, not just implemented as a default.
- **Audit logs**: retained longer than the data they describe, in all cases — they're the dispute-resolution evidence trail and should outlive the underlying records per §3.2/§4's rationale. Exact period is a 🚩 counsel question (Legal & Compliance §3), not an engineering one, but the mechanism (never auto-deleted on the same schedule as the data it logs) is decided here.
- **Per-jurisdiction variation**: the retention *mechanism* above is jurisdiction-agnostic; the retention *periods* are expected to vary by jurisdiction once AfterVault expands beyond the US-only MVP (Phase 3). The schema does not currently model retention periods as jurisdiction-scoped configuration data — this is a known gap to close before Phase 3 jurisdiction expansion, not before MVP launch, since MVP is single-jurisdiction.
