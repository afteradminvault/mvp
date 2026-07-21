import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared setup for integration tests that exercise real RLS policies
 * against the live Supabase project (see vitest.integration.setup.ts).
 * Used by both rls-estate-isolation and rls-vault-isolation tests.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const adminClient = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export interface TestUser {
  id: string;
  email: string;
  password: string;
}

export async function createConfirmedTestUser(): Promise<TestUser> {
  const email = `rls-test-${randomUUID()}@aftervault-test.local`;
  const password = `Test-${randomUUID()}!Aa1`;
  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  return { id: data.user.id, email, password };
}

export async function signedInClient(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

export async function fetchAnySupportedJurisdictionId(): Promise<string> {
  const { data, error } = await adminClient
    .from("jurisdictions")
    .select("id")
    .eq("is_supported", true)
    .limit(1)
    .single();
  if (error) throw error;
  return data.id;
}
