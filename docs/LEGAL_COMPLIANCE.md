# AfterVault — Legal & Compliance Framing

**⚠️ THIS IS NOT LEGAL ADVICE.** This document is a product-requirements framing of legal and regulatory concepts, written so engineering can design a configurable data model — it is not a substitute for review by a licensed attorney and must not be presented to users, investors, or regulators as a legal opinion. Every section below with a 🚩 marker is a specific point that **must** get real lawyer review before public launch. Scope: US-only MVP, as confirmed by the founder.

---

## 1. What "Legal Authority to Act" Requires (US, framed as configurable data, not hardcoded logic)

This is the single most important modeling decision in the legal domain: **legal authority requirements vary by state, by asset type, and by whether the deceased died with a will (testate) or without one (intestate).** None of this can be hardcoded per-user; it must live in reference data (`jurisdictions`, `legal_requirements` — see Database Schema) that platform admins can update as law and provider policy change.

### 1.1 Core documents that recur across almost every request

- **Certified death certificate.** Almost universally required, and almost universally required as a *certified copy*, not a photocopy or scan, for anything involving money or legal transfer (banks, brokerages, insurers). A scanned copy is usually sufficient for social media memorialization/removal requests. The data model must distinguish "certified original required" vs. "copy/scan accepted" per provider.
- **Evidence of executor/administrator authority**, one of:
  - **Letters Testamentary** — issued by a probate court when the deceased died *with* a valid will naming an executor.
  - **Letters of Administration** — issued when the deceased died *without* a will (intestate), naming a court-appointed administrator (who may or may not be the person the family would have chosen).
  - **Small estate affidavit** — many states offer a simplified, no-probate process for estates under a statutory dollar threshold (thresholds vary by state, e.g. roughly $50,000–$200,000-ish ranges depending on the state and asset type — 🚩 exact current thresholds per state must be lawyer-verified and kept in `legal_requirements`, not assumed static, since state legislatures update these figures).
- **Executor/administrator government-issued photo ID**, to match the name on the letters.
- **Notarization**, required by some providers/states for certain affidavits (e.g., a small-estate affidavit is often required to be notarized).

### 1.2 The digital-asset-specific layer: RUFADAA

The **Revised Uniform Fiduciary Access to Digital Assets Act (RUFADAA)** has been adopted, in some form, by most US states (a handful have older/non-uniform versions or non-adopting status — 🚩 confirm current state-by-state adoption status with counsel, this changes as remaining states legislate). RUFADAA is the specific legal backbone for "can an executor access a deceased person's digital accounts" and establishes a **priority order**:

1. **The platform's own online tool** takes priority if the deceased used one (e.g., Google's Inactive Account Manager, Facebook/Meta's Legacy Contact). If Diane (from the PRD) configured Google's Inactive Account Manager to name Marcus, that instruction generally controls over what her will says.
2. **The deceased's will or a separate legal document** expressing intent about digital assets, if no platform tool was used or it didn't cover the asset.
3. **Default statutory rules** if neither of the above exists, which are generally more restrictive — RUFADAA in its default mode often gives fiduciaries access to a catalog of communications (who/when) but *not* content, unless a court order says otherwise. Content access (e.g., actually reading emails) frequently requires a specific court order even with letters testamentary in hand.

**Product implication**: AfterVault's living-vault "intended outcome" field (§4.1 in the PRD) is not just a nice UX touch — for RUFADAA purposes it may function as exactly the kind of documented user intent that determines what an executor can legally obtain from a provider. 🚩 Whether AfterVault's own records could ever be *presented to a provider* as evidence of intent (vs. just being useful for the executor's own reference) is a question for counsel — do not market this capability without legal sign-off.

### 1.3 Per-provider variation on top of the legal baseline

Even holding the law constant, **every provider has its own submission process layered on top of the legal minimum**, and this is where most executor pain actually happens in practice:

- Google requires a separate, additional process to obtain account *content* even with a court order — it is not a simple form.
- Meta (Facebook/Instagram) primarily offers memorialization or removal via a request form; content release is rare and heavily gated.
- Banks/credit unions vary institution-by-institution on document format, whether they need originals mailed vs. accepted in-branch, and processing time.
- Crypto exchanges generally require the same estate documentation as banks (death certificate + letters testamentary + executor ID) but processes and required forms vary by exchange and are less standardized; some have hard account-recovery windows that lapse.
- Domain registrars typically require a transfer request plus the same core document set.

This is why `legal_requirements`/provider profile data is structured as **(jurisdiction × asset category × provider) → document checklist + submission channel**, not just (jurisdiction × asset category). See Database Schema §4.

### 1.4 🚩 Items requiring lawyer review before launch

1. Current small-estate-affidavit dollar thresholds per US state, and whether they vary by asset type within a state.
2. Current RUFADAA adoption/variant status per state (a few states have non-uniform digital-assets statutes).
3. Whether AfterVault's stored "intended outcome" instructions carry any legal weight as evidence of the deceased's intent, and if so what disclaimer language is required to avoid the product being mistaken for a will.
4. Whether generating provider-specific document checklists constitutes the unauthorized practice of law (UPL) in any state — this is a real risk for any product that says "here's what you legally need to do." Framing as "here's what [Provider]'s published process asks for" (factual, sourced from provider policy) rather than "here's your legal obligation" is likely safer but 🚩 needs explicit counsel sign-off on exact product copy before launch.
5. Terms of Service liability language: disclaiming that AfterVault does not guarantee any provider will honor a request, and is not liable for a provider's decision.

---

## 2. Data Privacy Regime Checklist

### 2.1 CCPA (California Consumer Privacy Act) — directly relevant to US MVP

- CCPA's protections apply to **"consumers,"** defined as natural persons who are California residents. 🚩 Whether and how CCPA rights (access, deletion, opt-out of sale) extend to a **deceased** person's data is genuinely unsettled/limited — CCPA does not clearly grant post-mortem privacy rights the way it does for the living, and this needs explicit counsel review rather than an engineering assumption. Practically: the Planner's data while alive is squarely covered (they're a living CA consumer using our service); the deceased's data after death sits in a legal gray zone, and product copy should not overclaim "CCPA-compliant post-mortem privacy" without sign-off.
- Regardless of the above ambiguity, **AfterVault's own handling of the Planner's data while they are alive** must meet standard CCPA obligations: right to know what's collected, right to delete, right to opt out of sale (we don't sell data, but the policy must say so), and a compliant privacy policy.
- California also has specific rules relevant to genetic/biometric-adjacent data that are unlikely to apply here (no biometrics in MVP) but worth flagging if MFA ever moves to biometric factors.

### 2.2 GDPR — not required for US-only MVP, but noted for Phase 3 planning

- GDPR (EU) explicitly **excludes deceased persons from the definition of "data subject"** — the regulation itself does not grant the deceased data-protection rights, though individual EU member states can and some do extend limited post-mortem protections via national law (this varies by country, not uniform across the EU). This is the opposite default from how one might assume ("GDPR = maximally protective") and is a common misconception worth flagging now even though it's out of scope for MVP.
- Since MVP is US-only, GDPR does not apply unless/until AfterVault serves EU residents. Flagging in this document only so the Phase 3 jurisdiction-expansion work doesn't start from a wrong assumption.

### 2.3 Other US regimes to be aware of (not all directly applicable to MVP feature set)

- **GLBA (Gramm-Leach-Bliley Act)**: governs financial institutions' handling of nonpublic personal financial information. AfterVault is not a financial institution, but if the product ever integrates directly with bank data (e.g., account aggregation, out of scope for MVP), this becomes directly relevant. 🚩 flag for review if/when account-aggregation features are considered.
- **State breach notification laws**: all US states have some form of breach notification law requiring disclosure to affected individuals if certain categories of personal data are exposed. Given AfterVault stores credentials and legal documents, an incident response / breach notification plan is a launch requirement, not optional. 🚩 needs counsel-reviewed incident response plan before handling real user data, not just before "launch" in the marketing sense.
- **State-specific data privacy laws beyond CCPA** (e.g., Virginia CDPA, Colorado CPA, and others) — increasingly common; MVP should assume the CCPA-equivalent obligations as a floor and revisit per-state nuance 🚩 with counsel as the user base grows beyond California.

### 2.4 Product-level implication: deceased-data handling is different from living-user data handling by design, not by oversight

Because of the ambiguity in §2.1, AfterVault's default posture should be: **treat the deceased's stored data with at least the same protection as a living user's data**, even where the law doesn't clearly require it — both because it's the trust-preserving thing to do for a grief-sensitive product, and because regulatory ambiguity tends to resolve toward more protection over time, not less. This is a product/ethics stance, not a legal requirement — 🚩 confirm with counsel that this stance doesn't create liability of its own (e.g., promising more retention/protection than we can operationally sustain).

---

## 3. Data Retention & Deletion — Requirements List (detailed policy in Security Architecture §5)

- Planners must be able to delete their account and vault contents while alive, with a defined grace/undelete window (standard SaaS pattern) before hard deletion.
- After an estate is closed (§4.5 in PRD), a retention period for legal documents and audit logs is required — 🚩 counsel should confirm a defensible minimum retention period for documents that may be relevant to future disputes (e.g., a contested closure request), balanced against the deceased's family's interest in eventual deletion. A commonly-used starting assumption for statute-of-limitations-adjacent retention is multi-year, not indefinite — 🚩 do not finalize a specific number without counsel.
- Audit logs of vault access (see Security Architecture §3) should be retained longer than the underlying vault contents in most designs, since they're the evidence trail if access is ever disputed — 🚩 counsel should confirm this doesn't conflict with any deletion-right obligation.

---

## 4. Summary of 🚩 Items Requiring Lawyer Review Before Public Launch

1. State-by-state small-estate-affidavit thresholds and RUFADAA adoption variants (data content, not architecture — can be populated post-architecture, pre-launch).
2. Legal weight (if any) of AfterVault-stored "intended outcome" instructions.
3. Unauthorized-practice-of-law risk in how document checklists are worded and marketed.
4. ToS liability disclaimers re: provider decisions being outside our control.
5. CCPA post-mortem data ambiguity — confirm product copy doesn't overclaim.
6. Breach notification / incident response plan, state-by-state.
7. Document and audit-log retention periods post-estate-closure.

None of these block *architecture* work (the schema and security design are built to be configurable specifically so this content can be populated/corrected without a redesign) — but none of them should be considered resolved, and #3 and #4 in particular should be reviewed before any public marketing copy goes out, not just before general-availability launch.
