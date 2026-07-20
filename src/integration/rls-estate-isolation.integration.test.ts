import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Milestone 0 exit criterion (docs/DEVELOPMENT_ROADMAP.md): "a test row
 * respects RLS ... this should be an actual automated test, not a manual
 * check, since it's the single most important behavior in the system to
 * regression-test." Runs against the real Supabase project (see
 * vitest.integration.setup.ts) — RLS policies are database behavior, not
 * something a mocked-repository unit test can exercise.
 *
 * Two real auth users are provisioned via the admin API (email_confirm:
 * true, bypassing the signup email-confirmation flow that blocks a session
 * otherwise), each creates their own estate through the real create_estate()
 * RPC (supabase/migrations/20260719120100_rls_policies.sql), and every
 * assertion below runs through the anon-key client authenticated as that
 * specific user — i.e., through the exact RLS policies a real request hits,
 * not the service-role client (which bypasses RLS and is used here only for
 * test setup/teardown).
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const adminClient = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function createConfirmedTestUser(): Promise<{ id: string; email: string; password: string }> {
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

async function signedInClient(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

describe("RLS: estate isolation between unrelated users", () => {
  let userA: { id: string; email: string; password: string };
  let userB: { id: string; email: string; password: string };
  let clientA: SupabaseClient;
  let clientB: SupabaseClient;
  let estateAId: string;
  let estateBId: string;
  let assetAId: string;
  let jurisdictionId: string;

  beforeAll(async () => {
    userA = await createConfirmedTestUser();
    userB = await createConfirmedTestUser();
    clientA = await signedInClient(userA.email, userA.password);
    clientB = await signedInClient(userB.email, userB.password);

    const { data: jurisdiction, error: jurisdictionError } = await adminClient
      .from("jurisdictions")
      .select("id")
      .eq("is_supported", true)
      .limit(1)
      .single();
    if (jurisdictionError) throw jurisdictionError;
    jurisdictionId = jurisdiction.id;

    const { data: estateA, error: estateAError } = await clientA.rpc("create_estate", {
      p_display_name: "User A's Estate",
      p_jurisdiction_id: jurisdictionId,
    });
    if (estateAError) throw estateAError;
    estateAId = estateA.id;

    const { data: estateB, error: estateBError } = await clientB.rpc("create_estate", {
      p_display_name: "User B's Estate",
      p_jurisdiction_id: jurisdictionId,
    });
    if (estateBError) throw estateBError;
    estateBId = estateB.id;

    const { data: asset, error: assetError } = await clientA
      .from("digital_assets")
      .insert({ estate_id: estateAId, category: "financial", intended_outcome: "close" })
      .select("id")
      .single();
    if (assetError) throw assetError;
    assetAId = asset.id;
  });

  afterAll(async () => {
    // Service-role client bypasses RLS entirely — used only for cleanup, never
    // for the assertions above. estates must go before users (owner_user_id
    // is ON DELETE RESTRICT — see docs/DATABASE_SCHEMA.md §2.3).
    await adminClient.from("estates").delete().in("id", [estateAId, estateBId]);
    await adminClient.auth.admin.deleteUser(userA.id);
    await adminClient.auth.admin.deleteUser(userB.id);
  });

  it("lets the owner read their own estate", async () => {
    const { data, error } = await clientA.from("estates").select("*").eq("id", estateAId).maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(estateAId);
  });

  it("denies a user reading another user's estate", async () => {
    const { data, error } = await clientB.from("estates").select("*").eq("id", estateAId).maybeSingle();
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it("denies a user updating another user's estate", async () => {
    const { data, error } = await clientB
      .from("estates")
      .update({ display_name: "Hijacked" })
      .eq("id", estateAId)
      .select("*");
    expect(error).toBeNull();
    expect(data).toEqual([]);

    const { data: unchanged } = await adminClient
      .from("estates")
      .select("display_name")
      .eq("id", estateAId)
      .single();
    expect(unchanged?.display_name).toBe("User A's Estate");
  });

  it("denies a user reading another user's estate_members row", async () => {
    const { data, error } = await clientB
      .from("estate_members")
      .select("*")
      .eq("estate_id", estateAId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("denies a user reading another user's digital_assets", async () => {
    const { data, error } = await clientB.from("digital_assets").select("*").eq("id", assetAId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("denies a user inserting a digital_asset into another user's estate", async () => {
    const { data, error } = await clientB
      .from("digital_assets")
      .insert({ estate_id: estateAId, category: "other", intended_outcome: "ignore" })
      .select("id");
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it("lets the owner read their own digital_assets", async () => {
    const { data, error } = await clientA.from("digital_assets").select("*").eq("id", assetAId).maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(assetAId);
  });
});
