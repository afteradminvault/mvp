-- PostgREST caches the schema and doesn't always pick up newly created
-- functions (initialize_owner_vault_key, 20260721000100) immediately after
-- a direct `supabase db push`. This forces a reload.
notify pgrst, 'reload schema';
