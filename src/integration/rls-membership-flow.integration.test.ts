import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  createConfirmedTestUser,
  fetchAnySupportedJurisdictionId,
  signedInClient,
  type TestUser,
} from "./supabase-test-helpers";

const anonClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Milestone 1 feature 5 (nomination/invite flow) 🔒 — RLS/RPC coverage for
 * invite_member, get_invite_preview, accept_invite, get_member_public_keys,
 * wrap_key_share_for_member, and revoke_member
 * (supabase/migrations/20260730000100_case_member_role_and_rls.sql, was
 * 20260721000300_membership_invite_flow.sql before the PRD v2 rename).
 * Runs against the real project; order-dependent within this file
 * (fileParallelism: false) since accept/revoke are one-time state
 * transitions.
 */
describe("RLS: membership invite/accept/wrap-key-share/revoke flow", () => {
  let userA: TestUser; // estate owner
  let userB: TestUser; // unrelated
  let userC: TestUser; // invitee
  let clientA: SupabaseClient;
  let clientB: SupabaseClient;
  let clientC: SupabaseClient;
  let estateAId: string;
  let inviteToken: string;
  let memberId: string;

  beforeAll(async () => {
    userA = await createConfirmedTestUser();
    userB = await createConfirmedTestUser();
    userC = await createConfirmedTestUser();
    clientA = await signedInClient(userA.email, userA.password);
    clientB = await signedInClient(userB.email, userB.password);
    clientC = await signedInClient(userC.email, userC.password);

    const jurisdictionId = await fetchAnySupportedJurisdictionId();
    const { data: estateA, error: estateAError } = await clientA.rpc("create_case", {
      p_display_name: "Membership Test Estate",
      p_jurisdiction_id: jurisdictionId,
    });
    if (estateAError) throw estateAError;
    estateAId = estateA.id;
  });

  afterAll(async () => {
    await adminClient.from("cases").delete().eq("id", estateAId);
    await adminClient.auth.admin.deleteUser(userA.id);
    await adminClient.auth.admin.deleteUser(userB.id);
    await adminClient.auth.admin.deleteUser(userC.id);
  });

  it("denies an unrelated user from inviting a member to another case", async () => {
    const { error } = await clientB.rpc("invite_member", {
      p_case_id: estateAId,
      p_invite_email: "someone@example.com",
      p_role: "executor",
    });
    expect(error).not.toBeNull();
  });

  it("denies inviting a second family creator", async () => {
    const { error } = await clientA.rpc("invite_member", {
      p_case_id: estateAId,
      p_invite_email: userC.email,
      p_role: "family",
    });
    expect(error).not.toBeNull();
  });

  it("lets the owner invite an Executor", async () => {
    const { data, error } = await clientA.rpc("invite_member", {
      p_case_id: estateAId,
      p_invite_email: userC.email,
      p_role: "executor",
    });
    expect(error).toBeNull();
    expect(data.invite_status).toBe("pending");
    memberId = data.id;
    inviteToken = data.invite_token;
  });

  it("lets a completely unauthenticated client preview a valid invite", async () => {
    const { data: preview, error: previewError } = await anonClient.rpc("get_invite_preview", {
      p_token: inviteToken,
    });
    expect(previewError).toBeNull();
    expect(preview[0].case_display_name).toBe("Membership Test Estate");
    expect(preview[0].role).toBe("executor");
    expect(preview[0].valid).toBe(true);
  });

  it("returns no rows (not an error) for a nonexistent invite token, unauthenticated", async () => {
    const { data, error } = await anonClient.rpc("get_invite_preview", {
      p_token: "00000000-0000-0000-0000-000000000000",
    });
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("lets the invitee accept the invite, persisting their keypair on their own account", async () => {
    const { data, error } = await clientC.rpc("accept_invite", {
      p_token: inviteToken,
      p_public_key: "\\xaabbcc",
      p_wrapped_private_key: "\\x112233",
      p_kdf_salt: "\\x445566",
    });
    expect(error).toBeNull();
    expect(data.invite_status).toBe("accepted");
    expect(data.user_id).toBe(userC.id);

    const { data: userRow } = await adminClient.from("users").select("public_key").eq("id", userC.id).single();
    expect(userRow?.public_key).not.toBeNull();
  });

  it("denies re-accepting an already-accepted invite", async () => {
    const { error } = await clientC.rpc("accept_invite", {
      p_token: inviteToken,
      p_public_key: "\\xffffff",
      p_wrapped_private_key: "\\xffffff",
      p_kdf_salt: "\\xffffff",
    });
    expect(error).not.toBeNull();
  });

  it("lets the owner read the accepted member's public key", async () => {
    const { data, error } = await clientA.rpc("get_member_public_keys", { p_case_id: estateAId });
    expect(error).toBeNull();
    const entry = (data as { member_id: string; public_key: string }[]).find((row) => row.member_id === memberId);
    expect(entry).toBeDefined();
  });

  it("denies an unrelated user from reading member public keys for another case", async () => {
    const { data, error } = await clientB.rpc("get_member_public_keys", { p_case_id: estateAId });
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("denies an unrelated user from wrapping a key share for another case's member", async () => {
    const { error } = await clientB.rpc("wrap_key_share_for_member", {
      p_case_id: estateAId,
      p_member_id: memberId,
      p_sealed_vault_key: "\\xaabbcc",
    });
    expect(error).not.toBeNull();
  });

  it("lets the owner wrap a key share for the accepted member", async () => {
    const { data, error } = await clientA.rpc("wrap_key_share_for_member", {
      p_case_id: estateAId,
      p_member_id: memberId,
      p_sealed_vault_key: "\\xaabbcc",
    });
    expect(error).toBeNull();
    expect(data.wrapped_vault_key).not.toBeNull();
  });

  it("denies an unrelated user from revoking another case's member", async () => {
    const { error } = await clientB.rpc("revoke_member", { p_case_id: estateAId, p_member_id: memberId });
    expect(error).not.toBeNull();
  });

  it("denies the owner revoking themselves", async () => {
    const { data: ownerRow } = await adminClient
      .from("case_members")
      .select("id")
      .eq("case_id", estateAId)
      .eq("role", "family")
      .single();
    const { error } = await clientA.rpc("revoke_member", { p_case_id: estateAId, p_member_id: ownerRow!.id });
    expect(error).not.toBeNull();
  });

  it("lets the owner revoke the member — and revocation immediately cuts off further access", async () => {
    const { data, error } = await clientA.rpc("revoke_member", { p_case_id: estateAId, p_member_id: memberId });
    expect(error).toBeNull();
    expect(data.invite_status).toBe("revoked");

    // The row (and its already-distributed key share) is NOT deleted —
    // audit history and the documented "can't retroactively invalidate"
    // limitation both depend on this.
    const { data: stillExists } = await adminClient
      .from("case_members")
      .select("wrapped_vault_key")
      .eq("id", memberId)
      .single();
    expect(stillExists?.wrapped_vault_key).not.toBeNull();

    // But going forward, the revoked member has zero access — this is the
    // "airtight for the future" half of the UI's revoke warning.
    const { data: assetsAfterRevoke, error: assetsError } = await clientC
      .from("digital_assets")
      .select("*")
      .eq("estate_id", estateAId);
    expect(assetsError).toBeNull();
    expect(assetsAfterRevoke).toEqual([]);
  });
});
