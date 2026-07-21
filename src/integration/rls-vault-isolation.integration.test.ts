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
 * Milestone 1 feature 4 (vault item CRUD) 🔒 — RLS coverage for the two
 * new surfaces: the initialize_owner_vault_key() RPC
 * (supabase/migrations/20260721000100_vault_key_bootstrap.sql) and the
 * digital_vault_items policies already present from Milestone 0
 * (supabase/migrations/20260719120100_rls_policies.sql). Runs against the
 * real project — see rls-estate-isolation.integration.test.ts for the
 * general pattern this follows.
 *
 * Tests are ORDER-DEPENDENT within this file (fileParallelism: false —
 * see vitest.integration.config.ts): the wrong-role/wrong-estate vault-key
 * denials must run before the vault key is actually initialized, and the
 * "already initialized" test must run after.
 */
describe("RLS: vault key bootstrap and vault item access", () => {
  let userA: TestUser;
  let userB: TestUser;
  let userC: TestUser;
  let clientA: SupabaseClient;
  let clientB: SupabaseClient;
  let clientC: SupabaseClient;
  let estateAId: string;
  let assetAId: string;
  let itemAId: string;

  beforeAll(async () => {
    userA = await createConfirmedTestUser();
    userB = await createConfirmedTestUser();
    userC = await createConfirmedTestUser();
    clientA = await signedInClient(userA.email, userA.password);
    clientB = await signedInClient(userB.email, userB.password);
    clientC = await signedInClient(userC.email, userC.password);

    const jurisdictionId = await fetchAnySupportedJurisdictionId();

    const { data: estateA, error: estateAError } = await clientA.rpc("create_estate", {
      p_display_name: "Vault Test Estate",
      p_jurisdiction_id: jurisdictionId,
    });
    if (estateAError) throw estateAError;
    estateAId = estateA.id;

    const { error: memberError } = await adminClient.from("estate_members").insert({
      estate_id: estateAId,
      user_id: userC.id,
      role: "executor",
      invite_email: userC.email,
      invite_status: "accepted",
      accepted_at: new Date().toISOString(),
    });
    if (memberError) throw memberError;

    const { data: asset, error: assetError } = await clientA
      .from("digital_assets")
      .insert({ estate_id: estateAId, category: "financial", intended_outcome: "close" })
      .select("id")
      .single();
    if (assetError) throw assetError;
    assetAId = asset.id;
  });

  afterAll(async () => {
    await adminClient.from("estates").delete().eq("id", estateAId);
    await adminClient.auth.admin.deleteUser(userA.id);
    await adminClient.auth.admin.deleteUser(userB.id);
    await adminClient.auth.admin.deleteUser(userC.id);
  });

  it("denies an executor (same estate, not the owner) from initializing the vault key", async () => {
    const { error } = await clientC.rpc("initialize_owner_vault_key", {
      p_estate_id: estateAId,
      p_wrapped_vault_key: "\\xaabbcc",
    });
    expect(error).not.toBeNull();
  });

  it("denies an unrelated user from initializing another estate's vault key", async () => {
    const { error } = await clientB.rpc("initialize_owner_vault_key", {
      p_estate_id: estateAId,
      p_wrapped_vault_key: "\\xaabbcc",
    });
    expect(error).not.toBeNull();
  });

  it("lets the owner initialize their estate's vault key", async () => {
    const { data, error } = await clientA.rpc("initialize_owner_vault_key", {
      p_estate_id: estateAId,
      p_wrapped_vault_key: "\\xaabbcc",
      p_kdf_salt: "\\x112233",
    });
    expect(error).toBeNull();
    expect(data.wrapped_vault_key).not.toBeNull();

    const { data: userRow } = await adminClient.from("users").select("kdf_salt").eq("id", userA.id).single();
    expect(userRow?.kdf_salt).not.toBeNull();
  });

  it("denies re-initializing an already-initialized vault key", async () => {
    const { error } = await clientA.rpc("initialize_owner_vault_key", {
      p_estate_id: estateAId,
      p_wrapped_vault_key: "\\xffffff",
    });
    expect(error).not.toBeNull();
  });

  it("lets the owner create a vault item for their own asset", async () => {
    const { data, error } = await clientA
      .from("digital_vault_items")
      .insert({
        digital_asset_id: assetAId,
        item_type: "password",
        ciphertext: "\\xaabbcc",
        encryption_iv: "\\x112233",
        wrapped_data_key: "\\x445566",
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    if (!data) throw new Error("insert succeeded but no row was returned");
    itemAId = data.id;
  });

  it("denies an executor (pre-death) from reading vault items", async () => {
    const { data, error } = await clientC.from("digital_vault_items").select("*").eq("id", itemAId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("denies an executor (pre-death) from inserting a vault item", async () => {
    const { data, error } = await clientC
      .from("digital_vault_items")
      .insert({
        digital_asset_id: assetAId,
        item_type: "other",
        ciphertext: "\\x00",
        encryption_iv: "\\x00",
        wrapped_data_key: "\\x00",
      })
      .select("id");
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it("denies an unrelated user from reading another estate's vault items", async () => {
    const { data, error } = await clientB.from("digital_vault_items").select("*").eq("id", itemAId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("lets the owner rotate their own vault item", async () => {
    const { data, error } = await clientA
      .from("digital_vault_items")
      .update({ ciphertext: "\\xbeef00" })
      .eq("id", itemAId)
      .select("ciphertext")
      .single();
    expect(error).toBeNull();
    expect(data?.ciphertext).toBe("\\xbeef00");
  });

  it("denies an executor from rotating a vault item", async () => {
    const { data, error } = await clientC
      .from("digital_vault_items")
      .update({ ciphertext: "\\xaa" })
      .eq("id", itemAId)
      .select("*");
    expect(error).toBeNull();
    expect(data).toEqual([]);

    const { data: unchanged } = await adminClient
      .from("digital_vault_items")
      .select("ciphertext")
      .eq("id", itemAId)
      .single();
    expect(unchanged?.ciphertext).not.toBeNull();
  });

  it("lets the owner hard-delete their own vault item", async () => {
    const { error } = await clientA.from("digital_vault_items").delete().eq("id", itemAId);
    expect(error).toBeNull();

    const { data } = await adminClient.from("digital_vault_items").select("id").eq("id", itemAId).maybeSingle();
    expect(data).toBeNull();
  });
});
