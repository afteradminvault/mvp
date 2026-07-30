-- PRD v2 / Milestone 5 (Notification Letter Generator), US-6.5.
-- ALTER TYPE ... ADD VALUE must be in its own transaction, separate from
-- anything that references the new value — same constraint that shaped
-- the case_member_role/vault_item_type migrations. The next migration's
-- notification_letters table doesn't reference document_type at all
-- (only the auto-store-on-finalize application code does, at runtime,
-- well after this migration has committed) but this is kept as its own
-- file anyway for consistency with that established pattern.
alter type document_type add value 'notification_letter';

notify pgrst, 'reload schema';
