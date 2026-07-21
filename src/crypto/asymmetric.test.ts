import { describe, expect, it } from "vitest";
import { generateKeyPair, sealForRecipient, unsealAsRecipient } from "./asymmetric";
import { getSodium } from "./sodium";

describe("generateKeyPair", () => {
  it("produces X25519-sized public and private keys", async () => {
    const sodium = await getSodium();
    const keyPair = await generateKeyPair();
    expect(keyPair.publicKey).toHaveLength(sodium.crypto_box_PUBLICKEYBYTES);
    expect(keyPair.privateKey).toHaveLength(sodium.crypto_box_SECRETKEYBYTES);
  });

  it("generates a different keypair every call", async () => {
    const a = await generateKeyPair();
    const b = await generateKeyPair();
    expect(a.publicKey).not.toEqual(b.publicKey);
    expect(a.privateKey).not.toEqual(b.privateKey);
  });
});

describe("sealForRecipient / unsealAsRecipient", () => {
  // crypto_box_seal generates a random ephemeral keypair internally on
  // every call, so — unlike symmetric.test.ts — there is no fixed
  // input/output pair to pin as a known-answer vector here; round-trip and
  // negative tests are the correct (and only meaningful) way to test a
  // randomized primitive.
  it("round-trips a Vault Key to its intended recipient", async () => {
    const recipient = await generateKeyPair();
    const vaultKey = crypto.getRandomValues(new Uint8Array(32));
    const sealed = await sealForRecipient(vaultKey, recipient.publicKey);
    const opened = await unsealAsRecipient(sealed, recipient);
    expect(opened).toEqual(vaultKey);
  });

  it("produces ciphertext of the expected length", async () => {
    const sodium = await getSodium();
    const recipient = await generateKeyPair();
    const plaintext = new Uint8Array(32);
    const sealed = await sealForRecipient(plaintext, recipient.publicKey);
    expect(sealed).toHaveLength(32 + sodium.crypto_box_SEALBYTES);
  });

  it("cannot be opened by the wrong recipient's keypair", async () => {
    const intended = await generateKeyPair();
    const attacker = await generateKeyPair();
    const vaultKey = crypto.getRandomValues(new Uint8Array(32));
    const sealed = await sealForRecipient(vaultKey, intended.publicKey);
    await expect(unsealAsRecipient(sealed, attacker)).rejects.toThrow(/Unseal failed/);
  });

  it("fails to open if the sealed box is tampered with", async () => {
    const recipient = await generateKeyPair();
    const vaultKey = crypto.getRandomValues(new Uint8Array(32));
    const sealed = await sealForRecipient(vaultKey, recipient.publicKey);
    const tampered = sealed.slice();
    tampered[0] ^= 0xff;
    await expect(unsealAsRecipient(tampered, recipient)).rejects.toThrow(/Unseal failed/);
  });

  it("rejects a recipient public key of the wrong length", async () => {
    await expect(sealForRecipient(new Uint8Array(32), new Uint8Array(16))).rejects.toThrow(
      /public key must be/,
    );
  });
});
