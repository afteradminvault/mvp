import { describe, expect, it } from "vitest";
import { base64ToBytes, bytesToBase64, bytesToHex, hexToBytes } from "./encoding";

describe("hex encoding round trip (the actual bytea wire format)", () => {
  it("round-trips arbitrary bytes", async () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255, 16, 32, 127, 128]);
    const encoded = await bytesToHex(bytes);
    const decoded = await hexToBytes(encoded);
    expect(decoded).toEqual(bytes);
  });

  it("round-trips an empty buffer", async () => {
    const bytes = new Uint8Array([]);
    const encoded = await bytesToHex(bytes);
    const decoded = await hexToBytes(encoded);
    expect(decoded).toEqual(bytes);
  });

  it("produces a known lowercase encoding for a known input, with no prefix", async () => {
    const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    expect(await bytesToHex(bytes)).toBe("48656c6c6f");
  });
});

describe("base64 encoding round trip", () => {
  it("round-trips arbitrary bytes", async () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255, 16, 32, 127, 128]);
    const encoded = await bytesToBase64(bytes);
    const decoded = await base64ToBytes(encoded);
    expect(decoded).toEqual(bytes);
  });

  it("round-trips an empty buffer", async () => {
    const bytes = new Uint8Array([]);
    const encoded = await bytesToBase64(bytes);
    const decoded = await base64ToBytes(encoded);
    expect(decoded).toEqual(bytes);
  });

  it("produces a known encoding for a known input", async () => {
    const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    expect(await bytesToBase64(bytes)).toBe("SGVsbG8=");
  });
});
