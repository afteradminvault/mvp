-- Schema adjustment resolving docs/SECURITY_ARCHITECTURE.md §1.4 item 3,
-- proposed and approved alongside Milestone 1 feature 1 (client-side
-- encryption core) and feature 4 (vault item CRUD). 🔒

-- estate_members.wrapped_key_share was named as if it held one thing; per
-- the approved design it holds each member's wrapped copy of the estate's
-- Vault Key specifically — renamed to make that explicit. Used uniformly
-- for every role that gets a VK copy: an 'owner' row's ciphertext is the VK
-- wrapped directly under the Owner's password-derived key; an 'executor'
-- row's (primary or Backup, distinguished by fallback_order) is the VK
-- sealed under that member's public key.
alter table estate_members rename column wrapped_key_share to wrapped_vault_key;

-- A keypair belongs to the person's account, not a specific estate
-- membership (docs/SECURITY_ARCHITECTURE.md §1.4 item 3's own reasoning) —
-- one X25519 keypair per user, reusable across every estate they're an
-- Executor/Backup Executor on. kdf_salt is the single Argon2id salt for
-- that account's password-derived wrapping key, reused for both purposes
-- it ever serves: wrapping this user's own VK copy directly (when they're
-- an Owner) and/or wrapping this user's private key (when they're an
-- Executor/Helper).
alter table users add column public_key bytea null;
alter table users add column wrapped_private_key bytea null;
alter table users add column kdf_salt bytea null;
