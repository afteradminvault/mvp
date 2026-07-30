import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  createConfirmedTestUser,
  fetchAnySupportedJurisdictionId,
  signedInClient,
} from "./supabase-test-helpers";

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
 * otherwise), each creates their own case through the real create_case()
 * RPC (supabase/migrations/20260730000100_case_member_role_and_rls.sql,
 * was create_estate()), and every assertion below runs through the
 * anon-key client authenticated as that specific user — i.e., through the
 * exact RLS policies a real request hits, not the service-role client
 * (which bypasses RLS and is used here only for test setup/teardown).
 */

describe("RLS: estate isolation between unrelated users", () => {
  let userA: { id: string; email: string; password: string };
  let userB: { id: string; email: string; password: string };
  let userC: { id: string; email: string; password: string };
  let clientA: SupabaseClient;
  let clientB: SupabaseClient;
  let clientC: SupabaseClient;
  let estateAId: string;
  let estateBId: string;
  let assetAId: string;
  let jurisdictionId: string;

  beforeAll(async () => {
    userA = await createConfirmedTestUser();
    userB = await createConfirmedTestUser();
    userC = await createConfirmedTestUser();
    clientA = await signedInClient(userA.email, userA.password);
    clientB = await signedInClient(userB.email, userB.password);
    clientC = await signedInClient(userC.email, userC.password);

    jurisdictionId = await fetchAnySupportedJurisdictionId();

    const { data: estateA, error: estateAError } = await clientA.rpc("create_case", {
      p_display_name: "User A's Estate",
      p_jurisdiction_id: jurisdictionId,
    });
    if (estateAError) throw estateAError;
    estateAId = estateA.id;

    const { data: estateB, error: estateBError } = await clientB.rpc("create_case", {
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

    // userC is an accepted Executor on case A — inserted directly via the
    // service-role client (bypassing RLS) since the invite/accept flow
    // (Development Roadmap Milestone 1 step 5) doesn't exist yet. This tests
    // wrong-ROLE denial specifically (an accepted, same-case member who
    // isn't the owner), distinct from the wrong-CASE tests above.
    const { error: memberError } = await adminClient.from("case_members").insert({
      case_id: estateAId,
      user_id: userC.id,
      role: "executor",
      invite_email: userC.email,
      invite_status: "accepted",
      accepted_at: new Date().toISOString(),
    });
    if (memberError) throw memberError;
  });

  afterAll(async () => {
    // Service-role client bypasses RLS entirely — used only for cleanup, never
    // for the assertions above. cases must go before users (owner_user_id
    // is ON DELETE RESTRICT — see docs/DATABASE_SCHEMA.md §2.3); case_members
    // rows (including userC's) cascade-delete with their case.
    await adminClient.from("cases").delete().in("id", [estateAId, estateBId]);
    await adminClient.auth.admin.deleteUser(userA.id);
    await adminClient.auth.admin.deleteUser(userB.id);
    await adminClient.auth.admin.deleteUser(userC.id);
  });

  it("lets the owner read their own case", async () => {
    const { data, error } = await clientA.from("cases").select("*").eq("id", estateAId).maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(estateAId);
  });

  it("denies a user reading another user's case", async () => {
    const { data, error } = await clientB.from("cases").select("*").eq("id", estateAId).maybeSingle();
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it("denies a user updating another user's case", async () => {
    const { data, error } = await clientB
      .from("cases")
      .update({ display_name: "Hijacked" })
      .eq("id", estateAId)
      .select("*");
    expect(error).toBeNull();
    expect(data).toEqual([]);

    const { data: unchanged } = await adminClient
      .from("cases")
      .select("display_name")
      .eq("id", estateAId)
      .single();
    expect(unchanged?.display_name).toBe("User A's Estate");
  });

  it("denies a user reading another user's case_members row", async () => {
    const { data, error } = await clientB
      .from("case_members")
      .select("*")
      .eq("case_id", estateAId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  // --- case_members-specific wrong-role/wrong-case denial (US-1.3's own
  // acceptance criterion: "an automated RLS test confirms a wrong-role or
  // wrong-case request is denied") — the digital_assets tests above and
  // below already exercise the same is_case_member() gate transitively,
  // but these assert directly against case_members itself.
  it("denies a user inserting a case_members row for another user's case", async () => {
    const { data, error } = await clientB
      .from("case_members")
      .insert({ case_id: estateAId, role: "executor", invite_email: "intruder@example.com" })
      .select("id");
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it("denies an accepted Executor (wrong role) from updating a fellow case_members row", async () => {
    const { data, error } = await clientC
      .from("case_members")
      .update({ role: "family" })
      .eq("case_id", estateAId)
      .eq("user_id", userC.id)
      .select("*");
    expect(error).toBeNull();
    expect(data).toEqual([]);

    const { data: unchanged } = await adminClient
      .from("case_members")
      .select("role")
      .eq("case_id", estateAId)
      .eq("user_id", userC.id)
      .single();
    expect(unchanged?.role).toBe("executor");
  });

  it("lets an accepted Executor (right role, right case) read fellow case_members rows", async () => {
    const { data, error } = await clientC.from("case_members").select("*").eq("case_id", estateAId);
    expect(error).toBeNull();
    expect(data?.length).toBeGreaterThan(0);
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

  // --- Wrong-ROLE denial (same case, accepted member, not the owner) —
  // digital_assets_write_owner scopes writes to role='family' specifically,
  // distinct from the wrong-CASE isolation tested above.
  it("lets an accepted Executor on the same estate read its digital_assets", async () => {
    const { data, error } = await clientC.from("digital_assets").select("*").eq("id", assetAId).maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(assetAId);
  });

  it("denies an accepted Executor (not the owner) from creating a digital_asset", async () => {
    const { data, error } = await clientC
      .from("digital_assets")
      .insert({ estate_id: estateAId, category: "other", intended_outcome: "ignore" })
      .select("id");
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it("denies an accepted Executor (not the owner) from updating a digital_asset", async () => {
    const { data, error } = await clientC
      .from("digital_assets")
      .update({ intended_outcome: "transfer" })
      .eq("id", assetAId)
      .select("*");
    expect(error).toBeNull();
    expect(data).toEqual([]);

    const { data: unchanged } = await adminClient
      .from("digital_assets")
      .select("intended_outcome")
      .eq("id", assetAId)
      .single();
    expect(unchanged?.intended_outcome).toBe("close");
  });
});
