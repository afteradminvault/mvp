import { describe, expect, it } from "vitest";
import { generateSymmetricKey, encryptSymmetric, decryptSymmetric } from "./symmetric";
import { packEncryptedPayload, unpackEncryptedPayload } from "./wire-format";
import { getSodium } from "./sodium";

describe("packEncryptedPayload / unpackEncryptedPayload", () => {
  it("round-trips a real encrypted payload through packing", async () => {
    const key = await generateSymmetricKey();
    const plaintext = new TextEncoder().encode("wrap this under a single column");
    const payload = await encryptSymmetric(plaintext, key);

    const packed = await packEncryptedPayload(payload);
    const unpacked = await unpackEncryptedPayload(packed);

    expect(unpacked).toEqual(payload);
    const decrypted = await decryptSymmetric(unpacked, key);
    expect(decrypted).toEqual(plaintext);
  });

  it("places the nonce first, then the ciphertext", async () => {
    const sodium = await getSodium();
    const nonce = new Uint8Array(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES).fill(7);
    const ciphertext = new Uint8Array([1, 2, 3]);

    const packed = await packEncryptedPayload({ nonce, ciphertext });

    expect(packed.slice(0, nonce.length)).toEqual(nonce);
    expect(packed.slice(nonce.length)).toEqual(ciphertext);
  });

  it("throws when unpacking a buffer shorter than a nonce", async () => {
    await expect(unpackEncryptedPayload(new Uint8Array(4))).rejects.toThrow(/too short/);
  });
});
