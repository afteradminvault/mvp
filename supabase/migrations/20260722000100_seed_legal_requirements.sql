-- Seed baseline (country-level, provider-agnostic) legal_requirements
-- content per Development Roadmap Milestone 2 step 1 / Legal & Compliance
-- §1.1–§1.3. This is a starting structural baseline, not verified legal
-- guidance — see docs/LEGAL_COMPLIANCE.md's own header disclaimer, plus
-- the pending_counsel_review flag set explicitly true below on every row
-- that corresponds to one of that document's §1.4 🚩 items (state-variable
-- thresholds, RUFADAA adoption variants). Everything else here is a
-- structural document-type baseline (these documents exist and are
-- generally requested), not a claim about any specific state's law.

with us_baseline as (
  select id from jurisdictions where country_code = 'US' and region_code is null
)
insert into legal_requirements
  (jurisdiction_id, asset_category, requirement_type, submission_channel, display_order, notes, pending_counsel_review)
select us_baseline.id, v.asset_category, v.requirement_type, v.submission_channel, v.display_order, v.notes, v.pending_counsel_review
from us_baseline, (values
  -- Financial and crypto: the document-heavy categories (Legal & Compliance §1.1).
  ('financial'::asset_category, 'death_certificate_certified'::requirement_type, 'mail'::submission_channel, 1,
    'Certified original almost universally required by banks/brokerages for anything involving money — structural baseline, not state-specific.', false),
  ('financial', 'letters_testamentary', 'mail', 2,
    'Applies when the deceased died testate (with a will). See letters_of_administration for the intestate case.', false),
  ('financial', 'letters_of_administration', 'mail', 2,
    'Applies when the deceased died intestate (without a will) — court-appointed administrator rather than a named executor.', false),
  ('financial', 'executor_government_id', 'mail', 3, 'To match the name on the letters.', false),
  ('financial', 'small_estate_affidavit', 'mail', 4,
    '🚩 PENDING COUNSEL REVIEW (Legal & Compliance §1.4 item 1): dollar thresholds vary by state (roughly $50k-$200k range per that document, not verified here) and may vary by asset type within a state. Do not present a specific threshold to a user until counsel confirms current per-state figures.', true),

  ('crypto', 'death_certificate_certified', 'mail', 1,
    'Exchanges generally require the same core documentation as banks — structural baseline, not exchange-specific.', false),
  ('crypto', 'letters_testamentary', 'mail', 2, 'Testate case — see financial category note.', false),
  ('crypto', 'letters_of_administration', 'mail', 2, 'Intestate case — see financial category note.', false),
  ('crypto', 'executor_government_id', 'mail', 3, null, false),
  ('crypto', 'small_estate_affidavit', 'mail', 4,
    '🚩 PENDING COUNSEL REVIEW — see the financial category row of the same type; some exchanges also have hard account-recovery windows that lapse independent of estate documentation (Legal & Compliance §1.3), not modeled here.', true),

  -- Social/subscription/domain/cloud storage: content-access is where
  -- RUFADAA's default-mode restrictions bite hardest (Legal & Compliance §1.2).
  ('social', 'death_certificate_copy', 'online_form', 1,
    'A scanned copy is usually sufficient for memorialization/removal requests, unlike financial institutions.', false),
  ('social', 'court_order', 'mail', 2,
    '🚩 PENDING COUNSEL REVIEW (Legal & Compliance §1.4 item 2): RUFADAA adoption/variant status varies by state, and a provider''s own tool (e.g. Google Inactive Account Manager, Meta Legacy Contact) takes priority over this default if the deceased configured one. Whether a court order is actually required for CONTENT (not just a catalog) depends on both. This row is a conservative placeholder, not a verified per-state rule.', true),

  ('subscription', 'death_certificate_copy', 'online_form', 1, null, false),

  ('domain', 'death_certificate_certified', 'mail', 1,
    'Registrars generally require the same core document set as financial institutions for a transfer request.', false),
  ('domain', 'letters_testamentary', 'mail', 2, 'Testate case.', false),
  ('domain', 'letters_of_administration', 'mail', 2, 'Intestate case.', false),

  ('cloud_storage', 'death_certificate_copy', 'online_form', 1, null, false),
  ('cloud_storage', 'court_order', 'mail', 2,
    '🚩 PENDING COUNSEL REVIEW — same RUFADAA content-access caveat as the social category row of the same type.', true),

  ('other', 'death_certificate_copy', 'online_form', 1,
    'Generic fallback for unlisted providers — the actual requirement should be confirmed against the specific provider once known.', false)
) as v(asset_category, requirement_type, submission_channel, display_order, notes, pending_counsel_review);
