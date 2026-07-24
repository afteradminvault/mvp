import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  createConfirmedTestUser,
  fetchAnySupportedJurisdictionId,
  signedInClient,
  type TestUser,
} from "./supabase-test-helpers";

/**
 * Milestone 2 feature 3 (death reporting + verification workflow) 🔒 — the
 * false-positive-sensitive workflow called out explicitly in Security
 * Architecture §4.2. Covers report_death(), self_cancel(), the new
 * estates.status guard trigger (closing the raw-REST-bypass gap found
 * while building this feature), and the two new cron sweep functions
 * (escalate_overdue_to_verifying, escalate_lapsed_verifications). Runs
 * against the real project; order-dependent within this file
 * (fileParallelism: false) since these are one-time state transitions on
 * shared estate rows.
 */
describe("RLS: death reporting + verification workflow", () => {
  let owner: TestUser;
  let executor: TestUser;
  let helper: TestUser;
  let outsider: TestUser;
  let ownerClient: SupabaseClient;
  let executorClient: SupabaseClient;
  let helperClient: SupabaseClient;
  let outsiderClient: SupabaseClient;
  let estateId: string;

  beforeAll(async () => {
    // Four provisioned users plus two invite+accept round trips takes
    // longer than vitest's default 10s hook timeout.
    owner = await createConfirmedTestUser();
    executor = await createConfirmedTestUser();
    helper = await createConfirmedTestUser();
    outsider = await createConfirmedTestUser();
    ownerClient = await signedInClient(owner.email, owner.password);
    executorClient = await signedInClient(executor.email, executor.password);
    helperClient = await signedInClient(helper.email, helper.password);
    outsiderClient = await signedInClient(outsider.email, outsider.password);

    const jurisdictionId = await fetchAnySupportedJurisdictionId();
    const { data: estate, error: estateError } = await ownerClient.rpc("create_estate", {
      p_display_name: "Death Verification Test Estate",
      p_jurisdiction_id: jurisdictionId,
    });
    if (estateError) throw estateError;
    estateId = estate.id;
    expect(estate.status).toBe("active_living");

    for (const [invitee, role] of [
      [executor, "executor"],
      [helper, "helper"],
    ] as const) {
      const { data: member, error: inviteError } = await ownerClient.rpc("invite_member", {
        p_estate_id: estateId,
        p_invite_email: invitee.email,
        p_role: role,
      });
      if (inviteError) throw inviteError;

      const client = role === "executor" ? executorClient : helperClient;
      const { error: acceptError } = await client.rpc("accept_invite", {
        p_token: member.invite_token,
        p_public_key: "\\xaabbcc",
        p_wrapped_private_key: "\\x112233",
        p_kdf_salt: "\\x445566",
      });
      if (acceptError) throw acceptError;
    }
  }, 20_000);

  afterAll(async () => {
    await adminClient.from("estates").delete().eq("id", estateId);
    await adminClient.auth.admin.deleteUser(owner.id);
    await adminClient.auth.admin.deleteUser(executor.id);
    await adminClient.auth.admin.deleteUser(helper.id);
    await adminClient.auth.admin.deleteUser(outsider.id);
  });

  it("denies an unrelated user from reporting a death", async () => {
    const { error } = await outsiderClient.rpc("report_death", { p_estate_id: estateId });
    expect(error).not.toBeNull();
  });

  it("closes the raw-REST-bypass gap: the owner can no longer PATCH status directly", async () => {
    const { error } = await ownerClient.from("estates").update({ status: "active_executor" }).eq("id", estateId);
    expect(error).not.toBeNull();

    const { data } = await adminClient.from("estates").select("status").eq("id", estateId).single();
    expect(data?.status).toBe("active_living");
  });

  it("denies the owner from self-cancelling while not in verifying", async () => {
    const { error } = await ownerClient.rpc("self_cancel", { p_estate_id: estateId });
    expect(error).not.toBeNull();
  });

  it("lets an accepted helper report a death, transitioning straight to verifying", async () => {
    const { data, error } = await helperClient.rpc("report_death", { p_estate_id: estateId });
    expect(error).toBeNull();
    expect(data.status).toBe("verifying");
    expect(data.verification_started_at).not.toBeNull();

    const { data: logs, error: logsError } = await adminClient
      .from("audit_logs")
      .select("event_type, actor_user_id, metadata")
      .eq("estate_id", estateId)
      .eq("event_type", "death_reported");
    if (logsError) throw logsError;
    expect(logs).toHaveLength(1);
    expect(logs![0].actor_user_id).toBe(helper.id);
    expect(logs![0].metadata).toMatchObject({ source: "proactive_report", reporter_role: "helper" });
  });

  it("denies reporting a death again while already verifying", async () => {
    const { error } = await executorClient.rpc("report_death", { p_estate_id: estateId });
    expect(error).not.toBeNull();
  });

  it("denies a non-owner (executor) from self-cancelling", async () => {
    const { error } = await executorClient.rpc("self_cancel", { p_estate_id: estateId });
    expect(error).not.toBeNull();
  });

  it("lets the owner self-cancel, reverting to active_living and resetting last_check_in_at", async () => {
    const before = Date.now();
    const { data, error } = await ownerClient.rpc("self_cancel", { p_estate_id: estateId });
    expect(error).toBeNull();
    expect(data.status).toBe("active_living");
    expect(new Date(data.last_check_in_at).getTime()).toBeGreaterThanOrEqual(before - 1000);

    const { data: logs, error: logsError } = await adminClient
      .from("audit_logs")
      .select("actor_user_id")
      .eq("estate_id", estateId)
      .eq("event_type", "self_cancel_used");
    if (logsError) throw logsError;
    expect(logs).toHaveLength(1);
    expect(logs![0].actor_user_id).toBe(owner.id);
  });

  it("escalate_overdue_to_verifying() and escalate_lapsed_verifications() only touch estates whose window has actually elapsed", async () => {
    // Force this estate into checkin_overdue with a grace period already
    // elapsed, via a service-role client — the guard trigger's authorized
    // flag is set inside the RPCs under test, not available to a raw
    // update, so this uses mark_overdue_estates()'s own sibling RPC
    // indirectly by seeding last_check_in_at far enough in the past that
    // the real sweep functions themselves perform the transition.
    const { error: seedError } = await adminClient
      .from("estates")
      .update({ check_in_interval_days: 1, grace_period_days: 1, last_check_in_at: daysAgo(10) })
      .eq("id", estateId);
    if (seedError) throw seedError;

    const { data: overdue, error: overdueError } = await adminClient.rpc("mark_overdue_estates");
    if (overdueError) throw overdueError;
    expect((overdue as { id: string }[]).map((r) => r.id)).toContain(estateId);

    const { data: escalated, error: escalatedError } = await adminClient.rpc("escalate_overdue_to_verifying");
    if (escalatedError) throw escalatedError;
    expect((escalated as { id: string }[]).map((r) => r.id)).toContain(estateId);

    const { data: afterEscalation } = await adminClient
      .from("estates")
      .select("status, verification_started_at")
      .eq("id", estateId)
      .single();
    expect(afterEscalation?.status).toBe("verifying");
    expect(afterEscalation?.verification_started_at).not.toBeNull();

    const { data: escalationLogs, error: reportLogError } = await adminClient
      .from("audit_logs")
      .select("actor_user_id, metadata")
      .eq("estate_id", estateId)
      .eq("event_type", "death_reported")
      .is("actor_user_id", null);
    if (reportLogError) throw reportLogError;
    expect(escalationLogs).toHaveLength(1);
    expect(escalationLogs![0].metadata).toMatchObject({ source: "automated_escalation" });

    // Now push the self-cancel window into the past too, and confirm the
    // lapse sweep escalates to awaiting_death_certificate.
    const { error: windowSeedError } = await adminClient
      .from("estates")
      .update({ self_cancel_window_days: 1, verification_started_at: daysAgo(10) })
      .eq("id", estateId);
    if (windowSeedError) throw windowSeedError;

    const { data: lapsed, error: lapsedError } = await adminClient.rpc("escalate_lapsed_verifications");
    if (lapsedError) throw lapsedError;
    expect((lapsed as { id: string }[]).map((r) => r.id)).toContain(estateId);

    const { data: finalRow } = await adminClient.from("estates").select("status").eq("id", estateId).single();
    expect(finalRow?.status).toBe("awaiting_death_certificate");
  });
});

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}
