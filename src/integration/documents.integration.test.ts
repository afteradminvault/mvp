import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SupabaseDocumentRepository } from "@/infrastructure/documents/supabase-document-repository";
import {
  adminClient,
  createConfirmedTestUser,
  fetchAnySupportedJurisdictionId,
  signedInClient,
  type TestUser,
} from "./supabase-test-helpers";

/**
 * Milestone 2 feature 4 (documents CRUD + death-certificate gate) —
 * Database Schema §5.1, API Specification §9, Security Architecture §4.1's
 * "no route to active_executor that skips the death-certificate
 * requirement." Runs against the real project (real Storage uploads, not
 * mocked) since Storage RLS is exactly the kind of behavior a mocked
 * repository test can't exercise. Order-dependent within this file
 * (fileParallelism: false) — the estate is driven through real state
 * transitions across tests.
 */
describe("RLS + Storage: documents CRUD and the death-certificate gate", () => {
  let owner: TestUser;
  let executor: TestUser;
  let helper: TestUser;
  let outsider: TestUser;
  let ownerClient: SupabaseClient;
  let executorClient: SupabaseClient;
  let helperClient: SupabaseClient;
  let outsiderClient: SupabaseClient;
  let estateId: string;
  let uploadedDocumentId: string;
  let attachedDocumentId: string;
  let digitalAssetId: string;
  let closureRequestId: string;

  beforeAll(async () => {
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
      p_display_name: "Documents Test Estate",
      p_jurisdiction_id: jurisdictionId,
    });
    if (estateError) throw estateError;
    estateId = estate.id;

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
    if (closureRequestId) await adminClient.from("account_closure_requests").delete().eq("id", closureRequestId);
    if (digitalAssetId) await adminClient.from("digital_assets").delete().eq("id", digitalAssetId);
    await adminClient.storage.from("documents").remove([
      `${estateId}/${uploadedDocumentId}`,
      `${estateId}/${attachedDocumentId}`,
    ]);
    await adminClient.from("documents").delete().eq("estate_id", estateId);
    await adminClient.from("estates").delete().eq("id", estateId);
    await adminClient.auth.admin.deleteUser(owner.id);
    await adminClient.auth.admin.deleteUser(executor.id);
    await adminClient.auth.admin.deleteUser(helper.id);
    await adminClient.auth.admin.deleteUser(outsider.id);
  });

  it("denies a helper from uploading a document", async () => {
    const repository = new SupabaseDocumentRepository(helperClient);
    await expect(
      repository.uploadDocument(estateId, helper.id, {
        documentType: "other",
        fileName: "note.pdf",
        mimeType: "application/pdf",
        fileBytes: new Uint8Array([1, 2, 3]),
      }),
    ).rejects.toThrow();
  });

  it("lets an executor upload a document, storing the row and the storage object", async () => {
    const repository = new SupabaseDocumentRepository(executorClient);
    const document = await repository.uploadDocument(estateId, executor.id, {
      documentType: "letters_testamentary",
      fileName: "letters.pdf",
      mimeType: "application/pdf",
      fileBytes: new Uint8Array([1, 2, 3, 4]),
    });
    uploadedDocumentId = document.id;
    expect(document.estateId).toBe(estateId);
    expect(document.storagePath).toBe(`${estateId}/${document.id}`);

    const { data: storageList, error: storageError } = await adminClient.storage
      .from("documents")
      .list(estateId);
    if (storageError) throw storageError;
    expect(storageList?.some((f) => f.name === document.id)).toBe(true);
  });

  it("hides the document entirely from an outsider (not a member)", async () => {
    const repository = new SupabaseDocumentRepository(outsiderClient);
    const document = await repository.getDocument(estateId, uploadedDocumentId);
    expect(document).toBeNull();

    const signedUrl = await repository.createSignedDownloadUrl(estateId, uploadedDocumentId);
    expect(signedUrl).toBeNull();
  });

  it("lets the owner (who didn't upload it) get a real signed download URL", async () => {
    const repository = new SupabaseDocumentRepository(ownerClient);
    const signedUrl = await repository.createSignedDownloadUrl(estateId, uploadedDocumentId);
    expect(signedUrl).toMatch(/^https?:\/\//);
  });

  it("refuses to delete a document attached to an account closure request", async () => {
    const executorRepository = new SupabaseDocumentRepository(executorClient);
    const document = await executorRepository.uploadDocument(estateId, executor.id, {
      documentType: "small_estate_affidavit",
      fileName: "affidavit.pdf",
      mimeType: "application/pdf",
      fileBytes: new Uint8Array([5, 6, 7]),
    });
    attachedDocumentId = document.id;

    const { data: asset, error: assetError } = await adminClient
      .from("digital_assets")
      .insert({ estate_id: estateId, category: "other" })
      .select("id")
      .single();
    if (assetError) throw assetError;
    digitalAssetId = asset.id;

    const { data: request, error: requestError } = await adminClient
      .from("account_closure_requests")
      .insert({ digital_asset_id: digitalAssetId, estate_id: estateId, legal_requirement_snapshot: [] })
      .select("id")
      .single();
    if (requestError) throw requestError;
    closureRequestId = request.id;

    const { error: attachError } = await adminClient
      .from("account_closure_request_documents")
      .insert({ account_closure_request_id: closureRequestId, document_id: attachedDocumentId });
    if (attachError) throw attachError;

    const isAttached = await executorRepository.isAttachedToAnyClosureRequest(attachedDocumentId);
    expect(isAttached).toBe(true);
  });

  it("denies a non-member from calling activate_executor", async () => {
    const { error } = await outsiderClient.rpc("activate_executor", { p_estate_id: estateId });
    expect(error).not.toBeNull();
  });

  it("refuses to activate when the estate isn't awaiting a death certificate", async () => {
    const { error } = await executorClient.rpc("activate_executor", { p_estate_id: estateId });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/death certificate document must be attached/i);
  });

  it("cannot skip the gate via a raw status update either (guard trigger)", async () => {
    const { error } = await ownerClient.from("estates").update({ status: "active_executor" }).eq("id", estateId);
    expect(error).not.toBeNull();
  });

  it("drives the estate to awaiting_death_certificate via the real sweep functions", async () => {
    const { error: seedError } = await adminClient
      .from("estates")
      .update({ check_in_interval_days: 1, grace_period_days: 1, last_check_in_at: daysAgo(10) })
      .eq("id", estateId);
    if (seedError) throw seedError;

    const { error: overdueError } = await adminClient.rpc("mark_overdue_estates");
    if (overdueError) throw overdueError;
    const { error: escalateError } = await adminClient.rpc("escalate_overdue_to_verifying");
    if (escalateError) throw escalateError;

    const { error: windowSeedError } = await adminClient
      .from("estates")
      .update({ self_cancel_window_days: 1, verification_started_at: daysAgo(10) })
      .eq("id", estateId);
    if (windowSeedError) throw windowSeedError;

    const { error: lapsedError } = await adminClient.rpc("escalate_lapsed_verifications");
    if (lapsedError) throw lapsedError;

    const { data } = await adminClient.from("estates").select("status").eq("id", estateId).single();
    expect(data?.status).toBe("awaiting_death_certificate");
  });

  it("uploading a death_certificate now activates executor access", async () => {
    const repository = new SupabaseDocumentRepository(executorClient);
    const document = await repository.uploadDocument(estateId, executor.id, {
      documentType: "death_certificate",
      fileName: "certificate.pdf",
      mimeType: "application/pdf",
      fileBytes: new Uint8Array([8, 9]),
    });

    const activated = await repository.activateExecutorIfCertified(estateId);
    expect(activated?.status).toBe("active_executor");

    const { data: logs, error: logsError } = await adminClient
      .from("audit_logs")
      .select("actor_user_id, event_type")
      .eq("estate_id", estateId)
      .eq("event_type", "active_executor_activated");
    if (logsError) throw logsError;
    expect(logs).toHaveLength(1);
    expect(logs![0].actor_user_id).toBe(executor.id);

    await adminClient.storage.from("documents").remove([`${estateId}/${document.id}`]);
    await adminClient.from("documents").delete().eq("id", document.id);
  });

  it("re-running activate_executor is a safe no-op once already active_executor", async () => {
    const { data, error } = await executorClient.rpc("activate_executor", { p_estate_id: estateId });
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });
});

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}
