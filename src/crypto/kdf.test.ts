import { describe, expect, it } from "vitest";
import { deriveWrappingKey, generateKdfSalt } from "./kdf";
import { getSodium } from "./sodium";

describe("deriveWrappingKey (Argon2id, OPSLIMIT/MEMLIMIT_MODERATE)", () => {
  // Known-answer regression vector: computed once by running this exact
  // dependency (libsodium-wrappers-sumo@0.8.4) with fixed inputs, then
  // pinned here. Not sourced from an external RFC — Argon2id in libsodium
  // fixes parallelism=1, which the RFC 9106 vectors (parallelism=4) don't
  // match, and libsodium's OPSLIMIT_MODERATE/MEMLIMIT_MODERATE are
  // library-specific tuning presets with no independent published vector.
  // This still catches the bugs that matter: wrong parameter order, wrong
  // algorithm constant, wrong output length. See
  // src/crypto/symmetric.test.ts for a vector sourced from libsodium's own
  // published test suite instead.
  it("matches the pinned known-answer vector", async () => {
    const sodium = await getSodium();
    const salt = sodium.from_hex("000102030405060708090a0b0c0d0e0f");
    const key = await deriveWrappingKey("correct horse battery staple", salt);
    expect(sodium.to_hex(key)).toBe("aad608b5866cef907f47d5cae529ed01a91301c92c5d5fef46e1a65e394e5742");
  });

  it("derives a 32-byte key", async () => {
    const salt = await generateKdfSalt();
    const key = await deriveWrappingKey("some password", salt);
    expect(key).toHaveLength(32);
  });

  it("is deterministic for the same password and salt", async () => {
    const salt = await generateKdfSalt();
    const keyA = await deriveWrappingKey("same password", salt);
    const keyB = await deriveWrappingKey("same password", salt);
    expect(keyA).toEqual(keyB);
  });

  it("produces different keys for different passwords with the same salt", async () => {
    const salt = await generateKdfSalt();
    const keyA = await deriveWrappingKey("password one", salt);
    const keyB = await deriveWrappingKey("password two", salt);
    expect(keyA).not.toEqual(keyB);
  });

  it("produces different keys for the same password with different salts", async () => {
    const saltA = await generateKdfSalt();
    const saltB = await generateKdfSalt();
    const keyA = await deriveWrappingKey("same password", saltA);
    const keyB = await deriveWrappingKey("same password", saltB);
    expect(keyA).not.toEqual(keyB);
  });

  it("rejects a salt of the wrong length", async () => {
    await expect(deriveWrappingKey("password", new Uint8Array(8))).rejects.toThrow(/16 bytes/);
  });

  it("generateKdfSalt produces unique 16-byte salts", async () => {
    const salts = await Promise.all(Array.from({ length: 20 }, () => generateKdfSalt()));
    for (const salt of salts) {
      expect(salt).toHaveLength(16);
    }
    const unique = new Set(salts.map((salt) => Buffer.from(salt).toString("hex")));
    expect(unique.size).toBe(salts.length);
  });
});
