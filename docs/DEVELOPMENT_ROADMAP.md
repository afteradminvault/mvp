# AfterVault — Development Roadmap

Status: Draft v1 — for founder review. Milestone-based, not date-based, per the confirmed solo/small-team-no-fixed-deadline constraint. **Ordering principle**: what's hardest to unwind later (schema, encryption model, legal-document data model) is built and proven before anything is built on top of it; within that constraint, work is sequenced to get a real user (even just the founder, dogfooding) into a working path as fast as possible. Every milestone below is built feature-by-feature with explicit approval between features, per the standing process rule — this document sets order, not a green light to build multiple features unattended.

---

## Milestone 0 — Foundation (infrastructure, not a user-facing feature)

Nothing in Milestone 1+ can start before this exists and is verified working, because every later milestone writes to this schema and relies on this access-control model.

- Next.js (App Router) + TypeScript (strict) + Tailwind scaffold.
- Supabase project: client initialization (browser + server, SSR-pattern-correct), env var scaffolding (`.env.example`, no real keys committed).
- Initial migration: every table from Database Schema, all FKs/indexes/enums as specified.
- RLS policies enforcing the `estate_members`-based access model (Security Architecture §3.2) — **built now, not deferred**, because retrofitting RLS onto tables already holding real data is a much riskier migration than having it correct from the first row inserted.
- Supabase Auth configured: email/password + MFA (TOTP), matching the "MFA required for owner/executor" requirement.
- Deploy pipeline plus one placeholder background-job function, to prove the pattern works before real reminder logic is built on it. Originally Netlify (`netlify.toml`, Next.js runtime plugin, one Scheduled Function) through Milestone 1; migrated to Vercel afterward by explicit request — see docs/TECH_STACK.md's Hosting/Background jobs sections. The placeholder is now a Vercel Cron Job (`vercel.json` + a `CRON_SECRET`-checked API route).
- Resend configured with one working test send.
- OpenAI SDK + env var scaffolding only (no feature).
- CI: lint, type-check, unit test runner.

**Exit criteria**: project runs locally, migration applies cleanly to a fresh database, a test row respects RLS (i.e., a query as User A cannot read User B's estate data — this should be an actual automated test, not a manual check, since it's the single most important behavior in the system to regression-test), a test email sends, a test deploy succeeds (originally verified on Netlify; the pipeline now targets Vercel).

---

## Milestone 1 — Planner Path (Living Vault)

The first milestone that produces something a real user (starting with the founder, dogfooding) can actually use end-to-end: setting up a vault while alive. Deliberately excludes anything executor- or death-related — that's Milestone 2 — so this milestone can ship and start getting used/tested independently, per the "what unblocks user testing fastest" ordering principle.

**Hard gate before any vault-item code**: the client-side encryption design (Security Architecture §1 — zero-knowledge vault, executor key-recovery, the open items in §1.4) must be explicitly approved as its own review, separate from the rest of this milestone's feature approvals. This is called out because it is the hardest, least-reversible technical decision in the whole system — once real vault items exist under a given key-wrapping scheme, changing that scheme means a live re-encryption migration touching every user's data, which is exactly the kind of thing to get right before, not after, it's load-bearing.

Feature sequence (one at a time, approval between each):

1. **Client-side encryption core**: the key-hierarchy implementation (DEK/VK/wrapping keys per Security Architecture §1) as a tested, standalone module — before it's wired into any UI. This is where the §1.4 open items (redundancy model, KDF parameters, schema adjustment) get resolved and implemented.
2. **Estate creation (planning mode)**: a Planner creates their estate, selects jurisdiction (US only populated at MVP), sets check-in cadence.
3. **Asset inventory CRUD**: `digital_assets` create/list/edit/archive, no vault content yet — category, provider, intended outcome.
4. **Vault item CRUD**: wired to the encryption core from step 1 — create/view/rotate/delete vault items per asset. 🔒 security-sensitive per standing flag rule.
5. **Executor/Helper nomination flow**: invite, accept, public-key exchange, Owner wrapping a VK copy for each accepted member (Security Architecture §1.1–§1.2, API spec §3). 🔒 security-sensitive.
6. **Nomination-invite email via Resend**: the actual transactional template, replacing the Milestone 0 placeholder test send.
7. **Planner dashboard with readiness score**: surfaces the completion signal from PRD §4.1 (assets have instructions, executor confirmed, MFA on) — deliberately last in this milestone since it's a read-only aggregate over everything built in steps 2–5, easiest to build once those exist.

**Exit criteria**: a Planner can sign up, enable MFA, create an estate, add assets with encrypted vault items, nominate an executor who accepts the invite, and see a readiness score reflecting real state — all with tests alongside each feature (Testing Strategy doc, once written) and RLS verified for each new table's access pattern.

---

## Milestone 2 — Executor Path (Death Verification & Access)

Cannot start meaningfully before Milestone 1 exists (there's nothing to gain access to otherwise) and specifically depends on the key-recovery design from Milestone 1 step 1 being implemented, not just designed.

1. **Legal requirements content model + admin CRUD**: `providers`, `legal_requirements`, `jurisdictions` tables need at least a minimal admin interface (even a basic internal-only screen) before closure-request checklists can show real content — sequenced here because Milestone 1 didn't need it (Planners don't see legal checklists) but Milestone 2's closure-request UI is non-functional without it. Populate US jurisdiction content as part of this step (with the 🚩 items from Legal & Compliance §1.4 explicitly still marked unresolved/pending-counsel in the seeded data, not silently treated as final).
2. **Dead man's switch background job**: check-in-overdue detection, the state-machine transitions through `checkin_overdue` → `death_reported` (Security Architecture §4.1). 🔒 security-sensitive.
3. **Death reporting + verification workflow**: proactive report endpoint, self-cancel flow, multi-channel notice (email + SMS if available). 🔒 security-sensitive — this is the false-positive-sensitive workflow called out explicitly in Security Architecture §4.2.
4. **Document upload & death-certificate gating**: `documents` CRUD, and wiring the certified-death-certificate requirement as the hard gate before `active_executor` is reachable (Security Architecture §4.1's state machine has no path that skips this).
5. **Executor key-recovery flow**: the client-side unwrap sequence from Security Architecture §1.2, wired to the real `active_executor` transition. 🔒 security-sensitive.
6. **Asset inventory + vault view for Executor**: read access to `digital_assets` and (post-key-recovery) `digital_vault_items`, matching the RBAC/permission boundaries in API spec §5–§6.
7. **Account closure request CRUD**: checklist generation from `legal_requirements` (snapshotted per Database Schema §5.2), status tracking, document attachment/reuse.
8. **Closure-request notifications**: stale-request nudges (PRD §5), reusing the Scheduled Function pattern from Milestone 0/step 2 of this milestone.

**Exit criteria**: a full simulated death-to-closure cycle works end-to-end in a test environment — report filed, self-cancel tested (and confirmed it correctly blocks progression), death certificate uploaded, executor gains key-recovery access, a closure request is created with a real jurisdiction-appropriate checklist, and its status is tracked to resolution.

---

## Milestone 3 — Beneficiaries & Estate-Wide Views

Lower architectural risk than Milestones 1–2 (no new access-control model, no new crypto), sequenced after the harder work is proven.

1. `beneficiaries` CRUD, linked to assets or estate-wide.
2. Estate-wide closure-request dashboard (filterable status/category view, PRD §4.5).
3. Audit log viewer (API spec §13) — surfacing what's already being written since Milestone 0's RLS/audit design, just needs a UI.

---

## Milestone 4 — Billing

Deliberately after the product actually does something worth paying for, not before. Stripe integration is well-trodden and low architectural risk relative to everything above it — no reason to front-load it.

1. Stripe Checkout integration for Planner subscriptions.
2. Billing Portal (self-serve plan management).
3. Webhook reconciliation (`subscriptions`/`payments` tables, idempotent via `external_payment_id`).
4. Paywall enforcement (gate vault-item creation past some free-tier limit, or gate the whole product — pricing model is an open question flagged in PRD §7, needs resolution before this milestone starts, not during it).

---

## Milestone 5 — Notification Polish & Reliability Hardening

Everything here is refinement of paths already built, not new capability — appropriately last.

1. Full notification preference center (per-type opt-in/out where appropriate, e.g. not for security-critical notices).
2. Reminder cadence tuning based on real Milestone 1–2 usage (the config-driven cadences from PRD §5 exist from day one specifically so this milestone is a config change, not a redesign).
3. Monitoring/alerting hardening on the Scheduled Functions (job failure alerting — a silently-failed dead-man's-switch job is a severe failure mode, worth dedicated attention here).

---

## Explicitly Deferred Beyond This Roadmap (Phase 2/3 per PRD §3.2–§3.3)

Not sequenced here at all — revisit once Milestones 0–5 are live and generating real usage signal: AI assistant/semantic search, estate-lawyer multi-client dashboard, additional jurisdictions, automated account discovery, mobile apps, joint/shared vaults.

## Process Note

Per standing process rules: each numbered feature within each milestone is a stop-and-approve checkpoint, not a batch. Items marked 🔒 get an explicit security-sensitive flag at proposal time, separate from the general feature-approval ask. Milestone boundaries above are for sequencing/planning visibility — they are not themselves approval checkpoints in place of the per-feature ones.
