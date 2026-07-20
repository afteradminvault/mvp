# AfterVault — Product Requirements Document

Status: Draft v1 — for founder review
Scope: MVP target market is **United States only**. Multi-jurisdiction support (schema, legal-document config, i18n) is designed in from day one but only one jurisdiction's rules are populated at MVP.

---

## 1. Problem Statement

When someone dies (or becomes incapacitated), the people responsible for handling their affairs — an executor named in a will, a next-of-kin, or a court-appointed administrator — face two compounding problems:

1. **Discovery**: they usually don't know the full scope of the deceased's digital life. Which banks did they use? What subscriptions are draining a joint account? Is there cryptocurrency sitting in a wallet only the deceased could access? Which of the deceased's 40+ online accounts actually matter?
2. **Access**: even once a digital asset is identified, every platform (Google, Meta, banks, crypto exchanges, domain registrars) has a different, opaque, frequently-changing process for granting access or closing an account for a deceased user — and most require documentation (death certificate, letters testamentary, a notarized affidavit) the executor doesn't know they need until the request is already rejected once.

Today this is handled with spreadsheets, sticky notes, generic legal templates that don't map to any specific platform's actual submission process, and weeks of phone hold music. It is done during acute grief, by people who are not lawyers and have never done it before, and who typically only do it once in their life.

AfterVault's premise: **if a person inventories their digital life and grants access instructions *before* death (a "living vault"), and the platform maintains up-to-date, jurisdiction-aware knowledge of what each provider actually requires, the post-death process collapses from weeks of guesswork into a guided checklist.**

## 2. Target Users & Personas

### 2.1 The Planner (primary living user)
**Persona: Diane, 61, pre-retirement.** Diane has a will, drawn up by a lawyer 8 years ago, that says nothing about her 30+ online accounts. She uses a password manager for logins but has never written down which accounts matter, which have money in them, or what she wants to happen to her Facebook profile. She read a news story about a family locked out of a deceased parent's accounts for months and wants to avoid leaving that mess for her kids. She is willing to spend a Sunday afternoon setting things up but will not tolerate a confusing interface — she is comfortable with online banking and email but not "technical."

**Job to be done:** "Let me create a single, secure, organized record of my digital accounts and what I want done with each, and make sure the right person can get to it when the time comes — without me having to hand my passwords to anyone today."

### 2.2 The Executor / Next-of-Kin (primary bereaved user)
**Persona: Marcus, 34, Diane's son, named executor in her will.** Marcus has just lost his mother. He is grieving, has a full-time job, and has never administered an estate. He has a death certificate and, after several weeks, letters testamentary from probate court. He does not know that Google requires a court order to release account *contents* (not just close the account), that his mother's bank needs an original certified death certificate (not a photocopy), or that her Coinbase account will be permanently inaccessible if he doesn't act within a certain window after a support ticket goes stale.

**Job to be done:** "Tell me what I have legal authority to do right now, what I still need in order to do the rest, and exactly how to submit each request — and let me track what's done, pending, and stuck without re-deriving the process from scratch for every single account."

### 2.3 The Estate Lawyer / Fiduciary Professional (secondary user, Phase 2)
**Persona: Priya, estate attorney with 40 active client files.** Priya wants a professional dashboard across multiple client estates, not a single-estate consumer view. She needs to see status at a glance, generate documents with firm letterhead, and bill for time spent. She is a paid seat, not free, and is out of scope for MVP but the data model must not preclude her later (an `estates` row can have more than one professional attached without a redesign).

### 2.4 Platform Admin (internal)
**Persona: internal ops/support role.** Maintains the `legal_requirements` and `provider_profiles` reference data (what each platform/jurisdiction actually requires — this changes over time as providers update policy), handles escalated support, reviews flagged death-verification cases (see §7), and monitors abuse.

---

## 3. Scope

### 3.1 MVP (Milestone-gated; see Development Roadmap for build order)

- **Living Vault**: zero-knowledge encrypted storage for credentials, recovery codes, and instructions-on-death notes, scoped to individual `digital_asset` records. Client-side encryption; see Security Architecture.
- **Digital asset inventory**: manually-entered records (account type, platform, username/email, category — financial / social / subscription / crypto / cloud storage / domain / other) with per-asset "what should happen" instructions (close, transfer, memorialize, ignore).
- **Estate creation & death reporting**: a Planner pre-configures an estate and nominates one Executor and up to two Backup/Helper contacts. Death is reported via a verification workflow (§7), not a single click by any one party.
- **Executor onboarding**: once death is verified, the nominated executor gets guided access to the vault (subject to key-recovery mechanics — see Security Architecture) and the asset inventory.
- **Account-closure/access request tracking**: for each digital asset, AfterVault generates a jurisdiction- and provider-specific checklist of required documents and the actual submission channel (link, mailing address, or in-app instructions), and lets the executor mark status (Not Started → Documents Gathered → Submitted → In Progress → Resolved / Rejected → Needs Attention).
- **Document storage**: upload and store death certificates, letters testamentary, ID, and other legal documents, associated with the estate and reusable across multiple closure requests (upload once, attach to many).
- **Notifications & reminders**: planner check-in reminders (for the dead man's switch), executor task reminders, stale-request nudges.
- **Roles & permissions**: Planner (owner while alive), Executor, Helper (limited, non-executor collaborator — e.g., a sibling who can view status but not the vault), Platform Admin.
- **Billing**: single paid subscription tier for Planners (the vault is the product people pay for while alive). Executors do not pay — they're invited into an estate the Planner already paid for. (See Tech Stack for payments provider.)

### 3.2 Explicitly cut from MVP (Phase 2)

- AI assistant / semantic search over vault contents and closure-request guidance (OpenAI integration is scaffolded in config but not wired to any user-facing feature at MVP).
- Estate-lawyer multi-client professional dashboard, firm branding, billing-by-time.
- Multi-jurisdiction legal requirement sets beyond the US (schema supports it; content does not exist).
- Automated/API-based account discovery (e.g., scanning an inbox for subscription receipts to auto-populate the asset inventory). MVP is manual entry only.
- In-app secure messaging between executor and platform support reps.
- Mobile native apps (MVP is responsive web only).
- Digital will drafting or e-signature/notarization workflow.
- Support for joint/shared vaults (e.g., a married couple with a shared vault) — MVP is one Planner per estate.

### 3.3 Phase 3 (directional, not committed)

- International jurisdictions (UK, EU) with full GDPR-aware post-mortem data handling.
- Crypto-specific tooling (multisig wallet recovery guidance, hardware wallet seed phrase secure storage with dedicated UX).
- White-label / B2B2C offering through estate law firms or financial advisors.
- Automated provider-status polling where providers expose an API (unlikely for most, but e.g. some subscription-cancellation aggregators do).

---

## 4. User Journeys

### 4.1 Setting up a Living Vault (Planner, while alive)
1. Diane signs up, verifies email, sets up MFA (required — see Security Architecture for why this is non-negotiable for this role).
2. She creates her estate (a lightweight profile: name, jurisdiction = US, state).
3. She adds digital assets one at a time: platform, category, account identifier, and — optionally — the sensitive credential/recovery info, which is encrypted client-side before it ever leaves her browser.
4. For each asset she sets an intended outcome ("close and donate remaining balance to X," "transfer domain to my daughter," "memorialize, don't delete").
5. She nominates Marcus as Executor and her sister as a Helper (view-only on closure status, no vault access).
6. Marcus and the sister each receive an invitation email; accepting establishes the key-recovery material needed later (see Security Architecture §1) without either of them seeing anything today.
7. Diane sets her check-in cadence (default: every 90 days) for the dead man's switch.
8. Dashboard shows a **readiness score**: % of assets with instructions set, whether an executor is confirmed, whether a death certificate contact/backup exists, whether MFA is on.

### 4.2 Reporting a Death
1. Trigger can be: (a) the dead man's switch firing after Diane misses check-ins and the grace period lapses, or (b) Marcus or the Helper proactively reporting the death.
2. Proactive reports require the reporter to be a nominated Executor or Helper on the estate (not a stranger, not the deceased's own account) and to attest to the death, and trigger the same verification workflow as the automated switch — a report alone does not unlock anything.
3. Verification workflow (detailed in Security Architecture §4): multi-channel notice to the Planner ("Diane, someone reported you as deceased" — email + SMS if available) with a window to self-cancel if it's a false positive, escalating to requiring the reporter to submit a death certificate before the vault unlocks.
4. Once verified, the estate status flips to "Active — Executor Access Granted" and Marcus is notified.

### 4.3 Executor Onboarding (post-verification)
1. Marcus logs in (he already has an account from accepting the nomination invite).
2. He's walked through: what he now has access to, what he still needs (his own government ID verification, the estate's death certificate if not already uploaded), and a summary of the asset inventory Diane left behind.
3. He completes the key-recovery step to unlock the vault (see Security Architecture — this is the step that turns his invitation-time key share into actual vault access).
4. Dashboard now shows the asset inventory with per-asset closure-request status, all at "Not Started."

### 4.4 Requesting Account Closure/Access
1. Marcus opens an asset (e.g., "Chase Checking ****1234").
2. AfterVault shows the jurisdiction-specific requirement set for "bank account, deceased owner, executor with letters testamentary, state = California" — pulled from `legal_requirements`/provider profile data, not hardcoded per-user.
3. Requirement list: certified death certificate (original), letters testamentary, executor government ID, bank's specific closure form (linked) or mailing address.
4. Marcus attaches documents he's already uploaded once (death certificate, letters testamentary reused across every request that needs them) and marks status as he progresses.
5. If Diane left an instruction ("transfer remaining balance to my daughter"), it's surfaced here so Marcus knows the intended outcome, not just the mechanical closure steps.

### 4.5 Tracking Status to Completion
1. Estate dashboard shows every asset's request status in one list, filterable by status and category.
2. Stale requests (no status change in N days while "Submitted"/"In Progress") get flagged and trigger a reminder to Marcus.
3. When every asset is Resolved or explicitly marked out-of-scope (e.g., "left to lapse," a subscription Marcus decided not to pursue), the estate can be marked Closed.

## 5. Notification & Reminder Logic

| Trigger | Recipient | Channel | Notes |
|---|---|---|---|
| Check-in due soon | Planner | Email | e.g., 7 days before cadence deadline |
| Check-in missed → grace period started | Planner | Email + SMS if available | Start of dead-man's-switch escalation |
| Death report filed by executor/helper | Planner | Email + SMS if available | Self-cancel window; see Security Architecture §4 |
| Death verified, vault unlocked | Executor | Email | Onboarding trigger |
| Nomination invite | Executor / Helper | Email | Acceptance required to establish key-recovery material |
| Closure request stale (configurable threshold, default 14 days no status change while Submitted/In Progress) | Executor | Email | One nudge, not a daily spam loop |
| New asset added to estate with no instructions set | Planner | In-app only (not email) | Nudges toward completing readiness score |
| Subscription/payment failure | Planner | Email | Billing, not estate-related |

Reminder cadences must be configurable per-notification-type at the platform level (not hardcoded per email) since the check-in interval, grace period, and stale-request threshold are exactly the kind of values that will get tuned post-launch based on real user behavior.

## 6. Explicit Non-Goals

AfterVault is **not**:

- A will-drafting or estate-planning legal service. We do not generate a will, do not provide legal advice, and do not replace an estate attorney.
- A substitute for probate. We help executors *execute* the authority a court or a bank already recognizes; we do not confer legal authority ourselves.
- A password manager for day-to-day use. The vault is designed for durability and eventual transfer, not for autofill-everywhere convenience; we are not competing with 1Password/Bitwarden on daily UX.
- A guarantee that any given platform will honor a request. We generate the correct documentation and process for a request; the third-party platform (Google, a bank, etc.) makes the final call, and their policies change without notice — the roadmap must account for `legal_requirements` content needing ongoing maintenance, not a one-time data load.
- A notary, witnessing, or e-signature service.
- A crypto custodian. We store instructions and recovery information the Planner chooses to store; we never hold private keys or funds ourselves.
- A medical or HIPAA-covered service. No health records.

---

## 7. Open Questions for Founder Review

1. Check-in cadence default (90 days assumed above) — confirm or adjust.
2. Whether Helpers can ever be promoted to Executor if the original Executor is unreachable/declines (assumed: yes, Planner can nominate a fallback order at setup — confirm this is in MVP or Phase 2).
3. Pricing model and price point are not specified here — deferred to a separate pricing doc, not blocking architecture work.
