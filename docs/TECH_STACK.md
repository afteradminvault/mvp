# AfterVault — Tech Stack Recommendation

Status: Draft v1 — for founder review. Optimized against the constraints confirmed for this build: **solo/small team (1–3 devs), no fixed deadline** → favor managed services and sequencing correctness over raw velocity or infra control; **US-only MVP** → no requirement yet to self-host for data-residency reasons; **compliance needs** driven by Legal & Compliance and Security Architecture docs, specifically zero-knowledge vault (client-side crypto is the one place "managed service" doesn't apply) and RLS-enforceable RBAC.

## Summary Table

| Layer | Choice | Alternative considered |
|---|---|---|
| Frontend framework | Next.js (App Router), React | Remix, plain Vite+React SPA |
| Language | TypeScript, strict mode | — |
| Styling | Tailwind CSS | CSS Modules, styled-components |
| Backend | Next.js Route Handlers (no separate backend service) | Standalone Node/Express API |
| Database | PostgreSQL via Supabase | Self-hosted Postgres, PlanetScale (MySQL, rejected) |
| Auth | Supabase Auth | Auth0, Clerk, custom |
| File storage | Supabase Storage | S3 directly, Cloudinary |
| Hosting/CDN | Vercel | Netlify (used through Milestone 1, migrated away — see below), Render, Fly.io |
| Background jobs | Vercel Cron Jobs | Netlify Scheduled Functions (same tradeoffs, see below), Supabase Edge Functions + pg_cron, a dedicated queue service |
| Payments | Stripe | Paddle |
| Transactional email | Resend | SendGrid, Postmark |
| AI (config only at MVP) | OpenAI | Anthropic |
| Client-side crypto | libsodium (libsodium-wrappers-sumo) | WebCrypto API directly, @noble/* libraries |
| Error tracking/monitoring | Sentry | Datadog, self-hosted |

## Justification by Layer

### Frontend: Next.js (App Router) + React + TypeScript (strict)
A single full-stack framework — Route Handlers double as the backend — is the right call for a 1–3 person team building a CRUD-and-workflow-heavy product: one deploy artifact, one language, no separate API service to version, deploy, and monitor independently. App Router specifically because Server Components let us keep non-vault reads (asset lists, closure-request status, legal-requirement checklists) off the client bundle without hand-rolling an API layer for every read, while still leaving the vault-specific client-side crypto work (§1 of Security Architecture) explicitly isolated to Client Components where it belongs. TypeScript strict mode is non-negotiable for a schema this relationally strict (Database Schema §0–§6) and for code handling encryption key material, where a type error catching a wrong-shaped key/ciphertext at compile time is worth the friction.

### Styling: Tailwind CSS
For a small team with no dedicated designer initially, a utility-first system keeps velocity up without a component-library dependency that would need its own upgrade/maintenance track. Straightforward choice, low risk either way — noting it mainly for completeness.

### Database & Backend-as-a-Service: Supabase (Postgres + Auth + Storage, one project)
This is the highest-leverage decision in the stack for this specific team-size/compliance combination:
- **Postgres is a hard requirement already** (per the schema doc's native ENUMs, jsonb, partial/unique indexes) — Supabase is managed Postgres, not a proprietary database with SQL-like syntax bolted on, so nothing in Database Schema needs to change to fit it.
- **Row-Level Security is native to Postgres, and Supabase's entire access model is built around it** — Security Architecture §3.2's RBAC design (every estate-scoped table's policy resolving through `estate_members`) maps directly onto Postgres RLS policies with no translation layer or ORM-level permission system to keep in sync separately. For a small team, "the database itself enforces access control, not just application code" measurably lowers the risk of an access-control bug shipping unnoticed, which matters more here than on a typical CRUD app given what's in `digital_vault_items` and `documents`.
- **Auth is bundled and includes MFA (TOTP) support out of the box**, which Security Architecture §3.1 requires for the owner/executor roles — building custom MFA (TOTP secret generation, QR provisioning, backup codes) is real, security-sensitive work that a solo/small team should not take on when a managed provider already offers it correctly.
- **Storage is bundled and integrates with the same RLS model** — `documents` (Database Schema §5.1) can use storage-level policies keyed off the same `estate_members` logic as the database rows referencing them, one access-control mental model instead of two.
- **One project covers database + auth + storage** — for a small team, minimizing the number of separate vendor dashboards, billing relationships, and integration surfaces to reason about is itself a real reduction in operational risk, not just convenience.
- **Trade-off acknowledged**: Supabase is a vendor dependency for the most sensitive layer of the system. Mitigations already designed around this: the zero-knowledge vault design (Security Architecture §1) means Supabase itself never sees vault plaintext even though it hosts the ciphertext — the trust boundary that matters most doesn't actually depend on trusting Supabase. Standard Postgres underneath also means a future migration off Supabase (to self-hosted Postgres or another provider) is a real, if nontrivial, escape hatch — not a proprietary-format lock-in.

### Hosting/CDN: Vercel (migrated from Netlify after Milestone 1)
Originally Netlify per explicit instruction (the project ran on Netlify through Milestone 1 — `netlify.toml`, the Next.js Runtime plugin, and one Netlify Scheduled Function proved the Milestone 0 deploy pipeline). Switched to Vercel by explicit request afterward. As the framework author's own hosting platform, Vercel needs no equivalent validation of "does the runtime plugin actually support App Router correctly" — Next.js support is first-party. **Vercel Cron Jobs** now cover the background-job needs called out in the PRD: check-in-overdue detection, stale-closure-request nudges, the notification send queue.

### Background jobs: Vercel Cron Jobs
Given the job set is genuinely small and low-frequency (daily/hourly sweeps, not a high-throughput queue — see PRD §5's notification triggers and Database Schema §2.3/§5.2's scan-oriented indexes), a dedicated queue service (SQS+workers, BullMQ+Redis, etc.) would be infrastructure a 1–3 person team has to operate for no benefit at this scale. Vercel Cron Jobs run on the same platform already chosen for hosting, with no additional vendor — configured via `vercel.json`'s `crons` array, each entry hitting a normal API route on a schedule (unlike Netlify's model of a dedicated function with its own trigger), so the route itself must verify the `Authorization: Bearer $CRON_SECRET` header Vercel sends, or it's a publicly-reachable endpoint. **Trade-off acknowledged**: cron jobs are simple cron-on-a-timer, not a durable job queue with retries/backoff — acceptable for "sweep a table and send some emails" jobs, would need revisiting if a future feature needs guaranteed-exactly-once processing of a high-volume stream (not a Year 1 concern per the confirmed scale assumption).

### Payments: Stripe
Handles subscription billing (Database Schema §6.3/§6.4's `subscriptions`/`payments` tables are shaped around a standard Stripe-customer/Stripe-subscription webhook-reconciliation pattern) with PCI compliance entirely offloaded — a solo/small team should never touch raw card data, and Stripe's hosted Checkout/Billing Portal means we don't have to build payment UI at all for MVP. Chosen over Paddle mainly on ecosystem maturity and the team's likely familiarity; either would satisfy the actual requirements here, low-risk choice.

### Transactional email: Resend
Per your explicit instruction. Justified independent of that instruction too: React Email (Resend's companion templating approach) fits a React-based stack better than a separate templating DSL, and the API is simple enough for a small team to integrate quickly for the notification set in PRD §5 (check-in reminders, death-report notices, nomination invites, stale-request nudges).

### AI: OpenAI (config/env scaffolding only at MVP)
Per your explicit instruction and PRD §3.2 (explicitly cut from MVP functionality, but not blocked on later). No functional integration at MVP; scaffolding now (API key env var, SDK dependency) only to avoid a later config-only PR being mistaken for feature work.

### Client-side cryptography: libsodium (via `libsodium-wrappers-sumo`)
This is the one layer where "pick a managed service" doesn't apply — it has to be a client-side library, and the choice matters because Security Architecture §1's design specifically needs Argon2id (password-based key derivation), an authenticated symmetric cipher (item-level DEK encryption), and asymmetric public-key encryption (wrapping the Vault Key for Executors who haven't shared a password with the Planner). **libsodium provides all three primitives (`crypto_pwhash` for Argon2id, `crypto_secretbox` for symmetric AEAD, `crypto_box` for asymmetric encryption) from one audited, widely-used library**, rather than assembling the same guarantees from several narrower libraries (e.g., WebCrypto's AES-GCM plus a separate Argon2 WASM package plus a separate asymmetric-crypto package) and having to reason about their interop and combined audit history ourselves. For a small team building the hardest-to-change part of the system, one well-audited library covering the exact primitive set the design calls for is a better risk trade than the marginal bundle-size savings of WebCrypto-native primitives (WebCrypto also doesn't natively support Argon2id or `crypto_box`-style sealed-box asymmetric encryption, so it wouldn't actually cover the full requirement anyway without still pulling in a second library).

### Error tracking/monitoring: Sentry
Standard choice for a small team — Next.js SDK integration is mature, covers both client and server errors, and has a workable free/low tier for Year 1 scale. Structured application logging beyond error tracking (e.g., a dedicated log aggregation service) is deliberately **not** recommended as a Day 1 dependency — Supabase's built-in query/API logs and Vercel's function/deploy logs cover MVP-scale debugging needs; add a dedicated logging service if/when actual operational pain justifies the added vendor relationship, not preemptively.

## What This Stack Deliberately Does Not Include (and why)

- **No separate backend service/API gateway** — Next.js Route Handlers are the backend. Revisit only if a future need (e.g., a heavy background-processing workload unsuited to serverless functions) actually requires a long-running process Vercel Functions can't provide.
- **No message queue / pub-sub system** — job volume at Year 1 scale doesn't warrant it (see Background Jobs above).
- **No self-hosted anything** — every managed service chosen has a credible migration path off it if needed later (standard Postgres under Supabase, standard SMTP-adjacent API under Resend, standard Stripe API), so starting managed and revisiting only if a specific pain point emerges is the lower-risk sequencing for this team size.
