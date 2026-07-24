import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { detectAndMarkOverdueEstates } from "@/infrastructure/dead-mans-switch/detect-overdue-estates";
import { adminClient, createConfirmedTestUser, fetchAnySupportedJurisdictionId, type TestUser } from "./supabase-test-helpers";

/**
 * Milestone 2 feature 2 (check-in-overdue detection) 🔒 — the entry point
 * to the death-verification pipeline. The per-row interval comparison
 * (last_check_in_at vs now() - check_in_interval_days) can't be expressed
 * through PostgREST's filter grammar, so it lives in the
 * mark_overdue_estates() Postgres function
 * (supabase/migrations/20260722010000_mark_overdue_estates.sql) — this test
 * exercises that real function against the live database rather than
 * mocking it, since the boundary semantics are fundamentally a database
 * concern.
 *
 * Estates are inserted directly via the service-role client rather than
 * through create_estate() (which requires auth.uid(), i.e. a real signed-in
 * session — not available to a service-role caller) so last_check_in_at and
 * status can be set to arbitrary values for each boundary case.
 */
describe("dead-man's-switch: mark_overdue_estates()", () => {
  let owner: TestUser;
  let jurisdictionId: string;
  const estateIds: Record<string, string> = {};

  beforeAll(async () => {
    owner = await createConfirmedTestUser();
    jurisdictionId = await fetchAnySupportedJurisdictionId();

    const rows = [
      {
        key: "justOverdue",
        status: "active_living",
        check_in_interval_days: 10,
        last_check_in_at: daysAgo(11),
      },
      {
        key: "notYetOverdue",
        status: "active_living",
        check_in_interval_days: 10,
        last_check_in_at: daysAgo(1),
      },
      {
        key: "alreadyOverdue",
        status: "checkin_overdue",
        check_in_interval_days: 10,
        last_check_in_at: daysAgo(20),
      },
      {
        key: "closedLongAgo",
        status: "closed",
        check_in_interval_days: 10,
        last_check_in_at: daysAgo(999),
      },
    ];

    for (const row of rows) {
      const { data, error } = await adminClient
        .from("estates")
        .insert({
          owner_user_id: owner.id,
          jurisdiction_id: jurisdictionId,
          display_name: `Dead-man's-switch test estate (${row.key})`,
          status: row.status,
          check_in_interval_days: row.check_in_interval_days,
          last_check_in_at: row.last_check_in_at,
        })
        .select("id")
        .single();
      if (error) throw error;
      estateIds[row.key] = data.id;
    }
  });

  afterAll(async () => {
    const allEstateIds = Object.values(estateIds);
    const { error: auditError } = await adminClient
      .from("audit_logs")
      .delete()
      .in("estate_id", allEstateIds);
    if (auditError) throw auditError;

    const { error: estatesError } = await adminClient.from("estates").delete().in("id", allEstateIds);
    if (estatesError) throw estatesError;

    await adminClient.auth.admin.deleteUser(owner.id);
  });

  it("transitions only the estate whose check-in interval has elapsed, leaving the others untouched", async () => {
    const transitioned = await detectAndMarkOverdueEstates(adminClient);
    const transitionedIds = transitioned.map((e) => e.id);

    expect(transitionedIds).toContain(estateIds.justOverdue);
    expect(transitionedIds).not.toContain(estateIds.notYetOverdue);
    expect(transitionedIds).not.toContain(estateIds.alreadyOverdue);
    expect(transitionedIds).not.toContain(estateIds.closedLongAgo);

    const { data: rows, error } = await adminClient
      .from("estates")
      .select("id, status")
      .in("id", Object.values(estateIds));
    if (error) throw error;
    const statusById = Object.fromEntries(rows!.map((r) => [r.id, r.status]));

    expect(statusById[estateIds.justOverdue]).toBe("checkin_overdue");
    expect(statusById[estateIds.notYetOverdue]).toBe("active_living");
    expect(statusById[estateIds.alreadyOverdue]).toBe("checkin_overdue");
    expect(statusById[estateIds.closedLongAgo]).toBe("closed");
  });

  it("writes exactly one system-actor audit log row for the transitioned estate", async () => {
    const { data: logs, error } = await adminClient
      .from("audit_logs")
      .select("actor_user_id, event_type, metadata")
      .eq("estate_id", estateIds.justOverdue)
      .eq("event_type", "checkin_overdue_detected");
    if (error) throw error;

    expect(logs).toHaveLength(1);
    expect(logs![0].actor_user_id).toBeNull();
    expect(logs![0].metadata).toMatchObject({ check_in_interval_days: 10 });
  });

  it("is idempotent — running it again transitions nothing further", async () => {
    const transitioned = await detectAndMarkOverdueEstates(adminClient);
    expect(transitioned.map((e) => e.id)).not.toContain(estateIds.justOverdue);

    const { data: logs, error } = await adminClient
      .from("audit_logs")
      .select("id")
      .eq("estate_id", estateIds.justOverdue)
      .eq("event_type", "checkin_overdue_detected");
    if (error) throw error;
    expect(logs).toHaveLength(1);
  });
});

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}
