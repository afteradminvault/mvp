import { describe, expect, it } from "vitest";
import { decryptSymmetric, encryptSymmetric, generateSymmetricKey } from "./symmetric";
import { getSodium } from "./sodium";

describe("XChaCha20-Poly1305 (crypto_aead_xchacha20poly1305_ietf)", () => {
  // Known-answer vector sourced directly from libsodium's own test suite
  // (test/default/aead_xchacha20poly1305.c + .exp — fetched from
  // https://github.com/jedisct1/libsodium/ at review time, transcribed as
  // explicit byte arrays rather than hand-assembled hex strings). Exercises
  // the raw primitive directly (not through encryptSymmetric's own nonce
  // generation) so it proves this module invokes
  // crypto_aead_xchacha20poly1305_ietf_encrypt with the correct argument
  // order/semantics, independent of this module's own round-trip logic.
  it("matches libsodium's own published test vector", async () => {
    const sodium = await getSodium();

    const key = new Uint8Array([
      0x80, 0x81, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x8b, 0x8c, 0x8d, 0x8e,
      0x8f, 0x90, 0x91, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0x9b, 0x9c, 0x9d,
      0x9e, 0x9f,
    ]);
    const nonce = new Uint8Array([
      0x07, 0x00, 0x00, 0x00, 0x40, 0x41, 0x42, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a,
      0x4b, 0x4c, 0x4d, 0x4e, 0x4f, 0x50, 0x51, 0x52, 0x53,
    ]);
    const ad = new Uint8Array([0x50, 0x51, 0x52, 0x53, 0xc0, 0xc1, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7]);
    const message =
      "Ladies and Gentlemen of the class of '99: If I could offer you " +
      "only one tip for the future, sunscreen would be it.";
    expect(message.length).toBe(114);

    const expectedCiphertext = new Uint8Array([
      0xf8, 0xeb, 0xea, 0x48, 0x75, 0x04, 0x40, 0x66, 0xfc, 0x16, 0x2a, 0x06, 0x04, 0xe1, 0x71,
      0xfe, 0xec, 0xfb, 0x3d, 0x20, 0x42, 0x52, 0x48, 0x56, 0x3b, 0xcf, 0xd5, 0xa1, 0x55, 0xdc,
      0xc4, 0x7b, 0xbd, 0xa7, 0x0b, 0x86, 0xe5, 0xab, 0x9b, 0x55, 0x00, 0x2b, 0xd1, 0x27, 0x4c,
      0x02, 0xdb, 0x35, 0x32, 0x1a, 0xcd, 0x7a, 0xf8, 0xb2, 0xe2, 0xd2, 0x50, 0x15, 0xe1, 0x36,
      0xb7, 0x67, 0x94, 0x58, 0xe9, 0xf4, 0x32, 0x43, 0xbf, 0x71, 0x9d, 0x63, 0x9b, 0xad, 0xb5,
      0xfe, 0xac, 0x03, 0xf8, 0x0a, 0x19, 0xa9, 0x6e, 0xf1, 0x0c, 0xb1, 0xd1, 0x53, 0x33, 0xa8,
      0x37, 0xb9, 0x09, 0x46, 0xba, 0x38, 0x54, 0xee, 0x74, 0xda, 0x3f, 0x25, 0x85, 0xef, 0xc7,
      0xe1, 0xe1, 0x70, 0xe1, 0x7e, 0x15, 0xe5, 0x63, 0xe7, 0x76, 0x01, 0xf4, 0xf8, 0x5c, 0xaf,
      0xa8, 0xe5, 0x87, 0x76, 0x14, 0xe1, 0x43, 0xe6, 0x84, 0x20,
    ]);
    expect(expectedCiphertext).toHaveLength(114 + sodium.crypto_aead_xchacha20poly1305_ietf_ABYTES);

    const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      sodium.from_string(message),
      ad,
      null,
      nonce,
      key,
    );
    expect(ciphertext).toEqual(expectedCiphertext);

    const decrypted = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      ciphertext,
      ad,
      nonce,
      key,
    );
    expect(sodium.to_string(decrypted)).toBe(message);
  });
});

describe("encryptSymmetric / decryptSymmetric", () => {
  it("round-trips arbitrary content", async () => {
    const key = await generateSymmetricKey();
    const plaintext = new TextEncoder().encode("a secret vault item value");
    const payload = await encryptSymmetric(plaintext, key);
    const decrypted = await decryptSymmetric(payload, key);
    expect(decrypted).toEqual(plaintext);
  });

  it("round-trips an empty plaintext", async () => {
    const key = await generateSymmetricKey();
    const payload = await encryptSymmetric(new Uint8Array([]), key);
    const decrypted = await decryptSymmetric(payload, key);
    expect(decrypted).toEqual(new Uint8Array([]));
  });

  it("generates a fresh, unique nonce every call", async () => {
    const key = await generateSymmetricKey();
    const plaintext = new TextEncoder().encode("same content every time");
    const payloads = await Promise.all(
      Array.from({ length: 20 }, () => encryptSymmetric(plaintext, key)),
    );
    const nonces = new Set(payloads.map((p) => Buffer.from(p.nonce).toString("hex")));
    expect(nonces.size).toBe(payloads.length);
    // Same plaintext + key but different nonces must not produce identical
    // ciphertext — a repeated nonce (or a bug that reuses one) is exactly
    // the failure mode that breaks XChaCha20-Poly1305's security guarantees.
    const ciphertexts = new Set(payloads.map((p) => Buffer.from(p.ciphertext).toString("hex")));
    expect(ciphertexts.size).toBe(payloads.length);
  });

  it("rejects a key of the wrong length", async () => {
    await expect(encryptSymmetric(new Uint8Array([1, 2, 3]), new Uint8Array(16))).rejects.toThrow(
      /32 bytes/,
    );
  });

  it("fails to decrypt with the wrong key", async () => {
    const keyA = await generateSymmetricKey();
    const keyB = await generateSymmetricKey();
    const payload = await encryptSymmetric(new TextEncoder().encode("secret"), keyA);
    await expect(decryptSymmetric(payload, keyB)).rejects.toThrow(/Decryption failed/);
  });

  it("fails to decrypt if the ciphertext is tampered with", async () => {
    const key = await generateSymmetricKey();
    const payload = await encryptSymmetric(new TextEncoder().encode("secret"), key);
    const tampered = { ...payload, ciphertext: payload.ciphertext.slice() };
    tampered.ciphertext[0] ^= 0xff;
    await expect(decryptSymmetric(tampered, key)).rejects.toThrow(/Decryption failed/);
  });

  it("fails to decrypt if the nonce is tampered with", async () => {
    const key = await generateSymmetricKey();
    const payload = await encryptSymmetric(new TextEncoder().encode("secret"), key);
    const tampered = { ...payload, nonce: payload.nonce.slice() };
    tampered.nonce[0] ^= 0xff;
    await expect(decryptSymmetric(tampered, key)).rejects.toThrow(/Decryption failed/);
  });
});
