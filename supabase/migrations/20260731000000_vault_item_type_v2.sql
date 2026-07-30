-- PRD v2 §3.5 / Database Schema v2 §2.9 (US-3.1). Replaces v1's 6-value
-- content-type enum (password/recovery_code/security_question/note/
-- seed_phrase/other) with the new 7-value set
-- (password/crypto_seed_phrase/bank_detail/domain_login/subscription/
-- brokerage_account/custom). digital_vault_items.digital_asset_id is
-- deliberately untouched — vault items stay asset-scoped (confirmed
-- decision), only the type vocabulary changed.
--
-- Same technique as case_member_role
-- (20260730000100_case_member_role_and_rls.sql): a fresh enum type rather
-- than ALTER TYPE ... RENAME VALUE, since three of the old values have no
-- 1:1 new equivalent and need an explicit mapping, not just a rename:
--   password           -> password             (direct)
--   seed_phrase        -> crypto_seed_phrase    (direct)
--   recovery_code      -> custom                (lossy: no equivalent)
--   security_question  -> custom                (lossy: no equivalent)
--   note               -> custom                (lossy: freeform notes)
--   other              -> custom                (direct-enough)
-- This is a real, judgment-based lossy mapping, not something the source
-- material specified — flagged here so it isn't mistaken for a lossless
-- rename. No RLS/function changes needed: every digital_vault_items
-- policy and the vault-item RPCs reference the column generically, never
-- a specific item_type literal.

create type vault_item_type_v2 as enum (
  'password', 'crypto_seed_phrase', 'bank_detail', 'domain_login', 'subscription', 'brokerage_account', 'custom'
);

alter table digital_vault_items
  alter column item_type type vault_item_type_v2
  using (
    case item_type::text
      when 'password' then 'password'
      when 'seed_phrase' then 'crypto_seed_phrase'
      when 'recovery_code' then 'custom'
      when 'security_question' then 'custom'
      when 'note' then 'custom'
      when 'other' then 'custom'
    end
  )::vault_item_type_v2;

drop type vault_item_type;
alter type vault_item_type_v2 rename to vault_item_type;

notify pgrst, 'reload schema';
