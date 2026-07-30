-- Will Builder epic. ALTER TYPE ... ADD VALUE must be in its own
-- transaction, separate from anything that references the new value —
-- same constraint as the notification_letter/case_member_role/
-- vault_item_type migrations. The generated will PDF is stored via the
-- existing documents table (encrypted-at-rest, readable by any accepted
-- case member) — the opposite property from the zero-knowledge vault,
-- deliberately: a will needs to be readable by the executor and family
-- once relevant, not something AfterVault itself can never decrypt.
alter type document_type add value 'will';

notify pgrst, 'reload schema';
