import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ClosureRequestService } from "@/domain/closure-requests/closure-request-service";
import { SupabaseClosureRequestRepository } from "@/infrastructure/closure-requests/supabase-closure-request-repository";
import { SupabaseDigitalAssetRepository } from "@/infrastructure/assets/supabase-asset-repository";
import { SupabaseEstateRepository } from "@/infrastructure/estates/supabase-estate-repository";
import { SupabaseAdminLegalRequirementRepository } from "@/infrastructure/admin-legal-requirements/supabase-admin-legal-requirement-repository";
import { SupabaseDocumentRepository } from "@/infrastructure/documents/supabase-document-repository";
import {
  adminClient,
  createConfirmedTestUser,
  fetchAnySupportedJurisdictionId,
  signedInClient,
  type TestUser,
} from "./supabase-test-helpers";

/**
 * Milestone 2 feature 7 (account closure requests) — Database Schema
 * §5.2-§5.3, API Specification §10. No new migration was needed for this
 * feature: closure_requests_select_member / closure_requests_write_executor
 * / acrd_select_member / acrd_write_executor were already in place from the
 * initial schema migration. This test exercises them against the real
 * project, plus the checklist-snapshot generation and the cross-estate
 * document-attach guard. Order-dependent within this file
 * (fileParallelism: false).
 */
describe("closure requests: checklist snapshot, RBAC, and document attachment", () => {
  let owner: TestUser;
  let executor: TestUser;
  // Stands in for v1's accepted-Helper case — PRD v2 dropped that role
  // (folded into "family"); there's no invite path onto a second family
  // row, so this is inserted directly via the service-role client, same
  // pattern as rls-estate-isolation.integration.test.ts's executor row.
  // Still proves what matters here: closure_requests_select_member has no
  // role restriction (any accepted member reads), only
  // closure_requests_write_executor does.
  let otherFamilyMember: TestUser;
  let ownerClient: SupabaseClient;
  let executorClient: SupabaseClient;
  let otherFamilyMemberClient: SupabaseClient;
  let estateId: string;
  let jurisdictionId: string;
  let assetId: string;
  let matchingProviderId: string;
  let otherProviderId: string;
  let genericRequirementId: string;
  let providerRequirementId: string;
  let otherProviderRequirementId: string;
  let futureRequirementId: string;
  let closureRequestId: string;
  let ownEstateDocumentId: string;

  function service(client: SupabaseClient): ClosureRequestService {
    return new ClosureRequestService(
      new SupabaseClosureRequestRepository(client),
      new SupabaseDigitalAssetRepository(client),
      new SupabaseEstateRepository(client),
      new SupabaseAdminLegalRequirementRepository(client),
    );
  }

  beforeAll(async () => {
    owner = await createConfirmedTestUser();
    executor = await createConfirmedTestUser();
    otherFamilyMember = await createConfirmedTestUser();
    ownerClient = await signedInClient(owner.email, owner.password);
    executorClient = await signedInClient(executor.email, executor.password);
    otherFamilyMemberClient = await signedInClient(otherFamilyMember.email, otherFamilyMember.password);

    jurisdictionId = await fetchAnySupportedJurisdictionId();
    const { data: estate, error: estateError } = await ownerClient.rpc("create_case", {
      p_display_name: "Closure Request Test Estate",
      p_jurisdiction_id: jurisdictionId,
    });
    if (estateError) throw estateError;
    estateId = estate.id;

    const { data: member, error: inviteError } = await ownerClient.rpc("invite_member", {
      p_case_id: estateId,
      p_invite_email: executor.email,
      p_role: "executor",
    });
    if (inviteError) throw inviteError;
    const { error: acceptError } = await executorClient.rpc("accept_invite", {
      p_token: member.invite_token,
      p_public_key: "\\xaabbcc",
      p_wrapped_private_key: "\\x112233",
      p_kdf_salt: "\\x445566",
    });
    if (acceptError) throw acceptError;

    const { error: otherFamilyMemberError } = await adminClient.from("case_members").insert({
      case_id: estateId,
      user_id: otherFamilyMember.id,
      role: "family",
      invite_email: otherFamilyMember.email,
      invite_status: "accepted",
      accepted_at: new Date().toISOString(),
    });
    if (otherFamilyMemberError) throw otherFamilyMemberError;

    const uniqueSuffix = randomUUID();
    const { data: matchingProvider, error: providerError } = await adminClient
      .from("providers")
      .insert({ name: `Test Bank ${uniqueSuffix}`, default_category: "financial" })
      .select("id")
      .single();
    if (providerError) throw providerError;
    matchingProviderId = matchingProvider.id;

    const { data: otherProvider, error: otherProviderError } = await adminClient
      .from("providers")
      .insert({ name: `Other Bank ${uniqueSuffix}`, default_category: "financial" })
      .select("id")
      .single();
    if (otherProviderError) throw otherProviderError;
    otherProviderId = otherProvider.id;

    const { data: asset, error: assetError } = await adminClient
      .from("digital_assets")
      .insert({ estate_id: estateId, category: "financial", provider_id: matchingProviderId })
      .select("id")
      .single();
    if (assetError) throw assetError;
    assetId = asset.id;

    const { data: generic, error: genericError } = await adminClient
      .from("legal_requirements")
      .insert({
        jurisdiction_id: jurisdictionId,
        asset_category: "financial",
        provider_id: null,
        requirement_type: "death_certificate_certified",
        submission_channel: "mail",
        display_order: 0,
      })
      .select("id")
      .single();
    if (genericError) throw genericError;
    genericRequirementId = generic.id;

    const { data: providerSpecific, error: providerSpecificError } = await adminClient
      .from("legal_requirements")
      .insert({
        jurisdiction_id: jurisdictionId,
        asset_category: "financial",
        provider_id: matchingProviderId,
        requirement_type: "provider_specific_form",
        submission_channel: "online_form",
        display_order: 1,
      })
      .select("id")
      .single();
    if (providerSpecificError) throw providerSpecificError;
    providerRequirementId = providerSpecific.id;

    const { data: otherProviderReq, error: otherProviderReqError } = await adminClient
      .from("legal_requirements")
      .insert({
        jurisdiction_id: jurisdictionId,
        asset_category: "financial",
        provider_id: otherProviderId,
        requirement_type: "provider_specific_form",
        submission_channel: "online_form",
        display_order: 1,
      })
      .select("id")
      .single();
    if (otherProviderReqError) throw otherProviderReqError;
    otherProviderRequirementId = otherProviderReq.id;

    const { data: future, error: futureError } = await adminClient
      .from("legal_requirements")
      .insert({
        jurisdiction_id: jurisdictionId,
        asset_category: "financial",
        provider_id: null,
        requirement_type: "court_order",
        submission_channel: "mail",
        display_order: 2,
        effective_date: "2099-01-01",
      })
      .select("id")
      .single();
    if (futureError) throw futureError;
    futureRequirementId = future.id;
  }, 30_000);

  afterAll(async () => {
    await adminClient
      .from("legal_requirements")
      .delete()
      .in("id", [genericRequirementId, providerRequirementId, otherProviderRequirementId, futureRequirementId]);
    await adminClient.from("cases").delete().eq("id", estateId);
    await adminClient.from("providers").delete().in("id", [matchingProviderId, otherProviderId]);
    await adminClient.auth.admin.deleteUser(owner.id);
    await adminClient.auth.admin.deleteUser(executor.id);
    await adminClient.auth.admin.deleteUser(otherFamilyMember.id);
  }, 20_000);

  it("denies a non-executor family member from creating a closure request", async () => {
    await expect(service(otherFamilyMemberClient).createClosureRequest(estateId, assetId)).rejects.toThrow();
  });

  it("denies the owner from creating a closure request (executor-only per API spec §10)", async () => {
    await expect(service(ownerClient).createClosureRequest(estateId, assetId)).rejects.toThrow();
  });

  it("lets the executor create a closure request with a correctly-filtered checklist snapshot", async () => {
    const request = await service(executorClient).createClosureRequest(estateId, assetId);
    closureRequestId = request.id;

    const snapshotIds = request.legalRequirementSnapshot.map((item) => item.id);
    expect(snapshotIds).toContain(genericRequirementId);
    expect(snapshotIds).toContain(providerRequirementId);
    expect(snapshotIds).not.toContain(otherProviderRequirementId);
    expect(snapshotIds).not.toContain(futureRequirementId);

    // Ordered by displayOrder.
    expect(request.legalRequirementSnapshot[0]?.id).toBe(genericRequirementId);
    expect(request.status).toBe("not_started");
    expect(request.resolvedAt).toBeNull();
  });

  it("lets any accepted member (including a non-executor family member) read the closure request list", async () => {
    const otherFamilyMemberView = await service(otherFamilyMemberClient).listClosureRequests(estateId);
    expect(otherFamilyMemberView.map((r) => r.id)).toContain(closureRequestId);

    const filtered = await service(executorClient).listClosureRequests(estateId, { category: "financial" });
    expect(filtered.map((r) => r.id)).toContain(closureRequestId);

    const wrongCategory = await service(executorClient).listClosureRequests(estateId, { category: "social" });
    expect(wrongCategory.map((r) => r.id)).not.toContain(closureRequestId);
  });

  it("denies a non-executor family member from updating status", async () => {
    await expect(
      service(otherFamilyMemberClient).updateClosureRequest(closureRequestId, { status: "submitted" }),
    ).rejects.toThrow();
  });

  it("lets the executor update status, bumping last_status_change_at and setting resolved_at on resolution", async () => {
    const before = await service(executorClient).getClosureRequest(closureRequestId);

    const submitted = await service(executorClient).updateClosureRequest(closureRequestId, { status: "submitted" });
    expect(submitted.status).toBe("submitted");
    expect(new Date(submitted.lastStatusChangeAt).getTime()).toBeGreaterThan(
      new Date(before.lastStatusChangeAt).getTime(),
    );
    expect(submitted.resolvedAt).toBeNull();

    const resolved = await service(executorClient).updateClosureRequest(closureRequestId, { status: "resolved" });
    expect(resolved.status).toBe("resolved");
    expect(resolved.resolvedAt).not.toBeNull();
  });

  it("attaches an existing document from the same estate", async () => {
    const document = await new SupabaseDocumentRepository(executorClient).uploadDocument(estateId, executor.id, {
      documentType: "letters_testamentary",
      fileName: "letters.pdf",
      mimeType: "application/pdf",
      fileBytes: new Uint8Array([1, 2, 3]),
    });
    ownEstateDocumentId = document.id;

    const updated = await service(executorClient).attachDocument(closureRequestId, document.id);
    expect(updated.id).toBe(closureRequestId);

    const { data: joinRow, error } = await adminClient
      .from("account_closure_request_documents")
      .select("document_id")
      .eq("account_closure_request_id", closureRequestId)
      .eq("document_id", document.id)
      .maybeSingle();
    if (error) throw error;
    expect(joinRow).not.toBeNull();
  });

  it("rejects attaching a document that belongs to a different estate", async () => {
    const otherJurisdictionId = await fetchAnySupportedJurisdictionId();
    const { data: otherEstate, error: otherEstateError } = await ownerClient.rpc("create_case", {
      p_display_name: "Closure Request Test — Other Estate",
      p_jurisdiction_id: otherJurisdictionId,
    });
    if (otherEstateError) throw otherEstateError;

    const otherDocument = await new SupabaseDocumentRepository(ownerClient).uploadDocument(otherEstate.id, owner.id, {
      documentType: "other",
      fileName: "unrelated.pdf",
      mimeType: "application/pdf",
      fileBytes: new Uint8Array([4, 5, 6]),
    });

    await expect(service(executorClient).attachDocument(closureRequestId, otherDocument.id)).rejects.toThrow();

    await adminClient.storage.from("documents").remove([`${otherEstate.id}/${otherDocument.id}`]);
    await adminClient.from("documents").delete().eq("id", otherDocument.id);
    await adminClient.from("cases").delete().eq("id", otherEstate.id);
  });

  it("denies a non-executor family member from attaching documents", async () => {
    await expect(
      service(otherFamilyMemberClient).attachDocument(closureRequestId, ownEstateDocumentId),
    ).rejects.toThrow();
  });
});

/**
 * Milestone 2 feature 8 (stale-request nudges) — PRD §5, Database Schema
 * §5.2. Exercises mark_stale_closure_requests_needing_nudge() directly
 * against the real project (supabase/migrations/20260727000000_mark_stale_closure_requests_function.sql):
 * the (status, last_status_change_at) scan, the atomic "mark nudged so a
 * re-run is a no-op" behavior ("one nudge, not a daily spam loop"), and the
 * repository clearing stale_nudge_sent_at on status change so a request
 * that goes stale again later gets a fresh nudge. Own fixture (separate
 * from the describe block above) since it only needs a bare closure
 * request row, not a real checklist snapshot.
 */
describe("closure requests: stale-request nudge sweep (mark_stale_closure_requests_needing_nudge)", () => {
  let owner: TestUser;
  let executor: TestUser;
  let executorClient: SupabaseClient;
  let estateId: string;
  let assetId: string;
  let closureRequestId: string;

  function daysAgo(days: number): string {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  }

  beforeAll(async () => {
    owner = await createConfirmedTestUser();
    executor = await createConfirmedTestUser();
    const ownerClient = await signedInClient(owner.email, owner.password);
    executorClient = await signedInClient(executor.email, executor.password);

    const jurisdictionId = await fetchAnySupportedJurisdictionId();
    const { data: estate, error: estateError } = await ownerClient.rpc("create_case", {
      p_display_name: "Stale Nudge Test Estate",
      p_jurisdiction_id: jurisdictionId,
    });
    if (estateError) throw estateError;
    estateId = estate.id;

    const { data: member, error: inviteError } = await ownerClient.rpc("invite_member", {
      p_case_id: estateId,
      p_invite_email: executor.email,
      p_role: "executor",
    });
    if (inviteError) throw inviteError;
    const { error: acceptError } = await executorClient.rpc("accept_invite", {
      p_token: member.invite_token,
      p_public_key: "\\xaabbcc",
      p_wrapped_private_key: "\\x112233",
      p_kdf_salt: "\\x445566",
    });
    if (acceptError) throw acceptError;

    const { data: asset, error: assetError } = await adminClient
      .from("digital_assets")
      .insert({ estate_id: estateId, category: "financial" })
      .select("id")
      .single();
    if (assetError) throw assetError;
    assetId = asset.id;

    const { data: closureRequest, error: closureRequestError } = await adminClient
      .from("account_closure_requests")
      .insert({ estate_id: estateId, digital_asset_id: assetId, status: "submitted" })
      .select("id")
      .single();
    if (closureRequestError) throw closureRequestError;
    closureRequestId = closureRequest.id;
  }, 30_000);

  afterAll(async () => {
    await adminClient.from("cases").delete().eq("id", estateId);
    await adminClient.auth.admin.deleteUser(owner.id);
    await adminClient.auth.admin.deleteUser(executor.id);
  }, 20_000);

  it("does not nudge a request that hasn't gone stale yet", async () => {
    const { data, error } = await adminClient.rpc("mark_stale_closure_requests_needing_nudge", {
      p_threshold_days: 14,
    });
    if (error) throw error;
    expect((data as { id: string }[]).map((row) => row.id)).not.toContain(closureRequestId);
  });

  it("nudges a request stale beyond the threshold, marks stale_nudge_sent_at, and logs an audit event", async () => {
    const { error: backdateError } = await adminClient
      .from("account_closure_requests")
      .update({ last_status_change_at: daysAgo(20) })
      .eq("id", closureRequestId);
    if (backdateError) throw backdateError;

    const { data, error } = await adminClient.rpc("mark_stale_closure_requests_needing_nudge", {
      p_threshold_days: 14,
    });
    if (error) throw error;
    expect((data as { id: string; status: string }[]).find((row) => row.id === closureRequestId)?.status).toBe(
      "submitted",
    );

    const { data: row, error: rowError } = await adminClient
      .from("account_closure_requests")
      .select("stale_nudge_sent_at")
      .eq("id", closureRequestId)
      .single();
    if (rowError) throw rowError;
    expect(row.stale_nudge_sent_at).not.toBeNull();

    const { data: auditRows, error: auditError } = await adminClient
      .from("audit_logs")
      .select("actor_user_id")
      .eq("target_id", closureRequestId)
      .eq("event_type", "closure_request_stale_nudge_sent");
    if (auditError) throw auditError;
    expect(auditRows.length).toBeGreaterThan(0);
    expect(auditRows[0].actor_user_id).toBeNull();
  });

  it("does not nudge the same request again on a re-run (one nudge, not a daily spam loop)", async () => {
    const { data, error } = await adminClient.rpc("mark_stale_closure_requests_needing_nudge", {
      p_threshold_days: 14,
    });
    if (error) throw error;
    expect((data as { id: string }[]).map((row) => row.id)).not.toContain(closureRequestId);
  });

  it("clears stale_nudge_sent_at on status change, allowing a fresh nudge once stale again", async () => {
    await new SupabaseClosureRequestRepository(executorClient).updateClosureRequest(closureRequestId, {
      status: "in_progress",
    });

    const { data: afterStatusChange, error: afterStatusChangeError } = await adminClient
      .from("account_closure_requests")
      .select("stale_nudge_sent_at")
      .eq("id", closureRequestId)
      .single();
    if (afterStatusChangeError) throw afterStatusChangeError;
    expect(afterStatusChange.stale_nudge_sent_at).toBeNull();

    const { error: backdateError } = await adminClient
      .from("account_closure_requests")
      .update({ last_status_change_at: daysAgo(20) })
      .eq("id", closureRequestId);
    if (backdateError) throw backdateError;

    const { data: renudged, error: renudgedError } = await adminClient.rpc(
      "mark_stale_closure_requests_needing_nudge",
      { p_threshold_days: 14 },
    );
    if (renudgedError) throw renudgedError;
    expect((renudged as { id: string }[]).map((row) => row.id)).toContain(closureRequestId);
  });
});
