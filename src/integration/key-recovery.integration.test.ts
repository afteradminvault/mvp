import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateKeyPair } from "@/crypto/asymmetric";
import { bytesToHex, hexToBytes } from "@/crypto/encoding";
import { generateKdfSalt } from "@/crypto/kdf";
import {
  decryptVaultItemContent,
  derivePrivateKeyWrappingKey,
  encryptVaultItemContent,
  generateDataEncryptionKey,
  generateVaultKey,
  unwrapDataEncryptionKey,
  unwrapPrivateKeyForSelf,
  unwrapVaultKeyAsMember,
  wrapDataEncryptionKey,
  wrapPrivateKeyForSelf,
  wrapVaultKeyForMember,
} from "@/crypto/vault-key-hierarchy";
import { packEncryptedPayload, unpackEncryptedPayload } from "@/crypto/wire-format";
import { toByteaColumn } from "@/infrastructure/supabase/bytea-hex";
import { SupabaseKeyRecoveryRepository } from "@/infrastructure/key-recovery/supabase-key-recovery-repository";
import { SupabaseVaultItemRepository } from "@/infrastructure/vault-items/supabase-vault-item-repository";
import { SupabaseDigitalAssetRepository } from "@/infrastructure/assets/supabase-asset-repository";
import { SupabaseDocumentRepository } from "@/infrastructure/documents/supabase-document-repository";
import {
  adminClient,
  createConfirmedTestUser,
  fetchAnySupportedJurisdictionId,
  signedInClient,
  type TestUser,
} from "./supabase-test-helpers";

/**
 * Milestone 2 feature 5 (executor key-recovery) 🔒 + feature 6 (asset/
 * vault-item read paths for executor, Helper exclusion). Security
 * Architecture §1.2, API Specification §4-§6. This is the one test in the
 * suite that actually proves the full cryptographic chain end-to-end
 * (real X25519 keypair, real Argon2id-derived wrapping key, real
 * XChaCha20-Poly1305 vault item) rather than just asserting the server
 * returns the right-shaped ciphertext blobs — a mocked-repository test
 * can't distinguish "correct crypto" from "opaque blob passed through
 * unchanged." Order-dependent within this file (fileParallelism: false).
 */
describe("key-recovery + RBAC: executor unwrap chain, asset/vault-item read paths, Helper exclusion", () => {
  let owner: TestUser;
  let executor: TestUser;
  let helper: TestUser;
  let ownerClient: SupabaseClient;
  let executorClient: SupabaseClient;
  let helperClient: SupabaseClient;
  let estateId: string;
  let assetId: string;
  let vaultItemId: string;
  let executorMemberId: string;

  const executorPassword = "executor-account-password";
  let executorKeyPair: { publicKey: Uint8Array; privateKey: Uint8Array };
  let executorKdfSalt: Uint8Array;
  let vaultKey: Uint8Array;
  const plaintext = "correct horse battery staple";

  beforeAll(async () => {
    owner = await createConfirmedTestUser();
    executor = await createConfirmedTestUser();
    helper = await createConfirmedTestUser();
    ownerClient = await signedInClient(owner.email, owner.password);
    executorClient = await signedInClient(executor.email, executor.password);
    helperClient = await signedInClient(helper.email, helper.password);

    const jurisdictionId = await fetchAnySupportedJurisdictionId();
    const { data: estate, error: estateError } = await ownerClient.rpc("create_estate", {
      p_display_name: "Key Recovery Test Estate",
      p_jurisdiction_id: jurisdictionId,
    });
    if (estateError) throw estateError;
    estateId = estate.id;

    // --- Real invite/accept for the executor, with a real keypair ---
    const { data: executorMember, error: executorInviteError } = await ownerClient.rpc("invite_member", {
      p_estate_id: estateId,
      p_invite_email: executor.email,
      p_role: "executor",
    });
    if (executorInviteError) throw executorInviteError;
    executorMemberId = executorMember.id;

    executorKeyPair = await generateKeyPair();
    executorKdfSalt = await generateKdfSalt();
    const privateKeyWrappingKey = await derivePrivateKeyWrappingKey(executorPassword, executorKdfSalt);
    const wrappedPrivateKey = await wrapPrivateKeyForSelf(executorKeyPair.privateKey, privateKeyWrappingKey);
    const packedWrappedPrivateKey = await packEncryptedPayload(wrappedPrivateKey);

    const { error: acceptError } = await executorClient.rpc("accept_invite", {
      p_token: executorMember.invite_token,
      p_public_key: toByteaColumn(await bytesToHex(executorKeyPair.publicKey)),
      p_wrapped_private_key: toByteaColumn(await bytesToHex(packedWrappedPrivateKey)),
      p_kdf_salt: toByteaColumn(await bytesToHex(executorKdfSalt)),
    });
    if (acceptError) throw acceptError;

    // --- Helper: accepted, but never gets a wrapped VK copy (no vault access) ---
    const { data: helperMember, error: helperInviteError } = await ownerClient.rpc("invite_member", {
      p_estate_id: estateId,
      p_invite_email: helper.email,
      p_role: "helper",
    });
    if (helperInviteError) throw helperInviteError;
    const { error: helperAcceptError } = await helperClient.rpc("accept_invite", {
      p_token: helperMember.invite_token,
      p_public_key: "\\xaabbcc",
      p_wrapped_private_key: "\\x112233",
      p_kdf_salt: "\\x445566",
    });
    if (helperAcceptError) throw helperAcceptError;

    // --- A real asset + a real, correctly-encrypted vault item ---
    const { data: asset, error: assetError } = await adminClient
      .from("digital_assets")
      .insert({ estate_id: estateId, category: "financial" })
      .select("id")
      .single();
    if (assetError) throw assetError;
    assetId = asset.id;

    vaultKey = await generateVaultKey();
    const dek = await generateDataEncryptionKey();
    const encrypted = await encryptVaultItemContent(new TextEncoder().encode(plaintext), dek);
    const wrappedDek = await wrapDataEncryptionKey(dek, vaultKey);
    const packedWrappedDek = await packEncryptedPayload(wrappedDek);

    const vaultItem = await new SupabaseVaultItemRepository(ownerClient).createItem(assetId, {
      itemType: "password",
      ciphertext: await bytesToHex(encrypted.ciphertext),
      encryptionIv: await bytesToHex(encrypted.nonce),
      wrappedDataKey: await bytesToHex(packedWrappedDek),
    });
    vaultItemId = vaultItem.id;

    // --- Owner wraps a real VK copy for the executor (sealed box, no packing) ---
    const sealedVaultKey = await wrapVaultKeyForMember(vaultKey, executorKeyPair.publicKey);
    const { error: wrapError } = await ownerClient.rpc("wrap_key_share_for_member", {
      p_estate_id: estateId,
      p_member_id: executorMemberId,
      p_sealed_vault_key: toByteaColumn(await bytesToHex(sealedVaultKey)),
    });
    if (wrapError) throw wrapError;

    // --- Drive the estate to active_executor via the real, already-shipped state machine ---
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

    const documentRepo = new SupabaseDocumentRepository(executorClient);
    await documentRepo.uploadDocument(estateId, executor.id, {
      documentType: "death_certificate",
      fileName: "certificate.pdf",
      mimeType: "application/pdf",
      fileBytes: new Uint8Array([1, 2, 3]),
    });
    const activated = await documentRepo.activateExecutorIfCertified(estateId);
    expect(activated?.status).toBe("active_executor");
  }, 30_000);

  afterAll(async () => {
    const storageObjects = (await adminClient.storage.from("documents").list(estateId)).data ?? [];
    if (storageObjects.length > 0) {
      await adminClient.storage.from("documents").remove(storageObjects.map((f) => `${estateId}/${f.name}`));
    }
    await adminClient.from("documents").delete().eq("estate_id", estateId);
    await adminClient.from("estates").delete().eq("id", estateId);
    await adminClient.auth.admin.deleteUser(owner.id);
    await adminClient.auth.admin.deleteUser(executor.id);
    await adminClient.auth.admin.deleteUser(helper.id);
  }, 20_000);

  it("denies key-recovery material to the Helper (never got a wrapped VK, wrong role)", async () => {
    const material = await new SupabaseKeyRecoveryRepository(helperClient).getExecutorKeyRecoveryMaterial(
      estateId,
      helper.id,
    );
    expect(material).toBeNull();
  });

  it("returns the executor's real wrapped material via key-recovery", async () => {
    const material = await new SupabaseKeyRecoveryRepository(executorClient).getExecutorKeyRecoveryMaterial(
      estateId,
      executor.id,
    );
    expect(material).not.toBeNull();
    expect(material!.publicKey).toBe(await bytesToHex(executorKeyPair.publicKey));
  });

  it("unwraps the private key and the VK correctly through the full client-side chain", async () => {
    const material = await new SupabaseKeyRecoveryRepository(executorClient).getExecutorKeyRecoveryMaterial(
      estateId,
      executor.id,
    );

    const salt = await hexToBytes(material!.kdfSalt);
    const wrappingKey = await derivePrivateKeyWrappingKey(executorPassword, salt);
    const unpackedWrappedPrivateKey = await unpackEncryptedPayload(await hexToBytes(material!.wrappedPrivateKey));
    const recoveredPrivateKey = await unwrapPrivateKeyForSelf(unpackedWrappedPrivateKey, wrappingKey);
    expect(recoveredPrivateKey).toEqual(executorKeyPair.privateKey);

    const recoveredPublicKey = await hexToBytes(material!.publicKey);
    const sealedVaultKey = await hexToBytes(material!.wrappedVaultKey);
    const recoveredVaultKey = await unwrapVaultKeyAsMember(sealedVaultKey, {
      publicKey: recoveredPublicKey,
      privateKey: recoveredPrivateKey,
    });
    expect(recoveredVaultKey).toEqual(vaultKey);
  });

  it("decrypts a real vault item end-to-end using the recovered VK", async () => {
    const items = await new SupabaseVaultItemRepository(executorClient).listItems(assetId);
    expect(items.map((i) => i.id)).toContain(vaultItemId);
    const item = items.find((i) => i.id === vaultItemId)!;

    const packedWrappedDek = await hexToBytes(item.wrappedDataKey);
    const wrappedDek = await unpackEncryptedPayload(packedWrappedDek);
    const dek = await unwrapDataEncryptionKey(wrappedDek, vaultKey);
    const ciphertext = await hexToBytes(item.ciphertext);
    const nonce = await hexToBytes(item.encryptionIv);
    const decrypted = await decryptVaultItemContent({ ciphertext, nonce }, dek);

    expect(new TextDecoder().decode(decrypted)).toBe(plaintext);
  });

  it("denies the executor from creating a vault item (write is owner-only, API spec §6)", async () => {
    await expect(
      new SupabaseVaultItemRepository(executorClient).createItem(assetId, {
        itemType: "note",
        ciphertext: "aabb",
        encryptionIv: "ccdd",
        wrappedDataKey: "eeff",
      }),
    ).rejects.toThrow();
  });

  it("denies the executor from rotating or deleting the vault item it can read", async () => {
    const executorRepo = new SupabaseVaultItemRepository(executorClient);
    await expect(
      executorRepo.rotateItem(vaultItemId, { ciphertext: "aabb", encryptionIv: "ccdd", wrappedDataKey: "eeff" }),
    ).rejects.toThrow();

    // Deletes issue no error even when RLS blocks every row (0 rows
    // matched, not a permission error) — confirm the row still exists
    // rather than asserting on a thrown error.
    await executorRepo.deleteItem(vaultItemId);
    const stillThere = await new SupabaseVaultItemRepository(ownerClient).getItem(vaultItemId);
    expect(stillThere).not.toBeNull();
  });

  it("hides vault items entirely from the Helper (RLS has no Helper policy at all)", async () => {
    const items = await new SupabaseVaultItemRepository(helperClient).listItems(assetId);
    expect(items).toEqual([]);
  });

  it("still lets the Helper read non-vault asset metadata (API spec §5)", async () => {
    const assets = await new SupabaseDigitalAssetRepository(helperClient).listAssets(estateId);
    expect(assets.map((a) => a.id)).toContain(assetId);
  });
});

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}
