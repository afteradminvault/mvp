import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, createConfirmedTestUser, signedInClient, type TestUser } from "./supabase-test-helpers";

/**
 * Milestone 2 feature 1 (legal requirements admin CRUD) 🔒-adjacent —
 * platform_admins/is_platform_admin() is a new authorization dimension no
 * prior RLS test covers. Confirms a regular authenticated user is denied
 * writes to jurisdictions/providers/legal_requirements (and the
 * revise_legal_requirement RPC) while a platform_admin can perform them,
 * against the real project.
 */
describe("RLS: platform-admin-gated writes on jurisdictions/providers/legal_requirements", () => {
  let regularUser: TestUser;
  let adminUser: TestUser;
  let regularClient: SupabaseClient;
  let adminUserClient: SupabaseClient;
  let createdJurisdictionId: string;
  let createdProviderId: string;
  // Every legal_requirements row created during this suite (original +
  // every revised version) — tracked in one place and all deleted, with
  // errors checked, rather than an ad-hoc mid-test cleanup call.
  const createdRequirementIds: string[] = [];

  beforeAll(async () => {
    regularUser = await createConfirmedTestUser();
    adminUser = await createConfirmedTestUser();
    regularClient = await signedInClient(regularUser.email, regularUser.password);
    adminUserClient = await signedInClient(adminUser.email, adminUser.password);

    const { error: grantError } = await adminClient
      .from("platform_admins")
      .insert({ user_id: adminUser.id });
    if (grantError) throw grantError;
  });

  afterAll(async () => {
    for (const id of createdRequirementIds) {
      const { error } = await adminClient.from("legal_requirements").delete().eq("id", id);
      if (error) throw error;
    }
    if (createdProviderId) {
      const { error } = await adminClient.from("providers").delete().eq("id", createdProviderId);
      if (error) throw error;
    }
    if (createdJurisdictionId) {
      const { error } = await adminClient.from("jurisdictions").delete().eq("id", createdJurisdictionId);
      if (error) throw error;
    }
    await adminClient.from("platform_admins").delete().eq("user_id", adminUser.id);
    await adminClient.auth.admin.deleteUser(regularUser.id);
    await adminClient.auth.admin.deleteUser(adminUser.id);
  });

  it("is_platform_admin() correctly distinguishes the two accounts", async () => {
    const { data: regularIsAdmin } = await regularClient.rpc("is_platform_admin");
    const { data: adminIsAdmin } = await adminUserClient.rpc("is_platform_admin");
    expect(regularIsAdmin).toBe(false);
    expect(adminIsAdmin).toBe(true);
  });

  it("denies a regular user from creating a jurisdiction", async () => {
    const { data, error } = await regularClient
      .from("jurisdictions")
      .insert({ country_code: "ZZ", region_code: "T1", display_name: "Test Jurisdiction (regular user attempt)" })
      .select("id");
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it("lets a platform admin create a jurisdiction", async () => {
    const { data, error } = await adminUserClient
      .from("jurisdictions")
      .insert({ country_code: "ZZ", region_code: "T1", display_name: "Test Jurisdiction (RLS admin test)" })
      .select("id")
      .single();
    expect(error).toBeNull();
    if (!data) throw new Error("insert succeeded but no row was returned");
    createdJurisdictionId = data.id;
  });

  it("denies a regular user from creating a provider", async () => {
    const { data, error } = await regularClient
      .from("providers")
      .insert({ name: "Test Provider (regular user attempt)", default_category: "other" })
      .select("id");
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it("lets a platform admin create a provider", async () => {
    const { data, error } = await adminUserClient
      .from("providers")
      .insert({ name: "Test Provider (RLS admin test)", default_category: "other" })
      .select("id")
      .single();
    expect(error).toBeNull();
    if (!data) throw new Error("insert succeeded but no row was returned");
    createdProviderId = data.id;
  });

  it("denies a regular user from creating a legal requirement", async () => {
    const { data, error } = await regularClient
      .from("legal_requirements")
      .insert({
        jurisdiction_id: createdJurisdictionId,
        asset_category: "other",
        requirement_type: "death_certificate_copy",
        submission_channel: "online_form",
      })
      .select("id");
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it("lets a platform admin create a legal requirement", async () => {
    const { data, error } = await adminUserClient
      .from("legal_requirements")
      .insert({
        jurisdiction_id: createdJurisdictionId,
        asset_category: "other",
        requirement_type: "death_certificate_copy",
        submission_channel: "online_form",
        notes: "RLS test row",
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    if (!data) throw new Error("insert succeeded but no row was returned");
    createdRequirementIds.push(data.id);
  });

  it("denies a regular user from calling revise_legal_requirement", async () => {
    const originalId = createdRequirementIds[0];
    const { error } = await regularClient.rpc("revise_legal_requirement", {
      p_existing_id: originalId,
      p_jurisdiction_id: createdJurisdictionId,
      p_asset_category: "other",
      p_provider_id: null,
      p_requirement_type: "death_certificate_copy",
      p_submission_channel: "online_form",
      p_submission_detail: null,
      p_display_order: 0,
      p_notes: "attempted revision by non-admin",
      p_pending_counsel_review: false,
    });
    expect(error).not.toBeNull();

    const { data: unchanged } = await adminClient
      .from("legal_requirements")
      .select("notes, superseded_by_id")
      .eq("id", originalId)
      .single();
    expect(unchanged?.notes).toBe("RLS test row");
    expect(unchanged?.superseded_by_id).toBeNull();
  });

  it("lets a platform admin revise a legal requirement (new version, old row superseded)", async () => {
    const originalId = createdRequirementIds[0];
    const { data, error } = await adminUserClient.rpc("revise_legal_requirement", {
      p_existing_id: originalId,
      p_jurisdiction_id: createdJurisdictionId,
      p_asset_category: "other",
      p_provider_id: null,
      p_requirement_type: "death_certificate_copy",
      p_submission_channel: "online_form",
      p_submission_detail: null,
      p_display_order: 0,
      p_notes: "revised by admin",
      p_pending_counsel_review: true,
    });
    expect(error).toBeNull();
    expect(data.notes).toBe("revised by admin");
    expect(data.pending_counsel_review).toBe(true);
    createdRequirementIds.push(data.id);

    const { data: oldRow } = await adminClient
      .from("legal_requirements")
      .select("superseded_by_id")
      .eq("id", originalId)
      .single();
    expect(oldRow?.superseded_by_id).toBe(data.id);
  });
});
