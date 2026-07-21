import { describe, expect, it } from "vitest";
import { parseClientEnv, parseServerEnv } from "./env";

const validClientEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "https://project-ref.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
};

const validServerEnv = {
  ...validClientEnv,
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

function omit<T extends object, K extends keyof T>(source: T, key: K): Omit<T, K> {
  const copy: Partial<T> = { ...source };
  delete copy[key];
  return copy as Omit<T, K>;
}

describe("parseClientEnv", () => {
  it("returns the parsed values when all required vars are present and valid", () => {
    expect(parseClientEnv(validClientEnv)).toEqual(validClientEnv);
  });

  it("throws when NEXT_PUBLIC_SUPABASE_URL is missing", () => {
    expect(() => parseClientEnv(omit(validClientEnv, "NEXT_PUBLIC_SUPABASE_URL"))).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL/,
    );
  });

  it("throws when NEXT_PUBLIC_SUPABASE_URL is not a valid URL", () => {
    expect(() =>
      parseClientEnv({ ...validClientEnv, NEXT_PUBLIC_SUPABASE_URL: "not-a-url" }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("throws when NEXT_PUBLIC_SUPABASE_ANON_KEY is empty", () => {
    expect(() =>
      parseClientEnv({ ...validClientEnv, NEXT_PUBLIC_SUPABASE_ANON_KEY: "" }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  });
});

describe("parseServerEnv", () => {
  it("returns client + server values when everything is present and valid", () => {
    expect(parseServerEnv(validServerEnv)).toEqual(validServerEnv);
  });

  it("throws when SUPABASE_SERVICE_ROLE_KEY is missing, even if client vars are valid", () => {
    expect(() => parseServerEnv(omit(validServerEnv, "SUPABASE_SERVICE_ROLE_KEY"))).toThrow(
      /SUPABASE_SERVICE_ROLE_KEY/,
    );
  });

  it("throws for missing client vars before even checking server-only vars", () => {
    expect(() => parseServerEnv(omit(validServerEnv, "NEXT_PUBLIC_SUPABASE_URL"))).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL/,
    );
  });

  it("does not require RESEND_API_KEY or OPENAI_API_KEY (config-only, unwired at Milestone 0)", () => {
    expect(parseServerEnv(validServerEnv)).toEqual(validServerEnv);
  });

  it("throws if RESEND_API_KEY is present but empty", () => {
    expect(() =>
      parseServerEnv({ ...validServerEnv, RESEND_API_KEY: "" }),
    ).toThrow(/RESEND_API_KEY/);
  });

  it("does not require RESEND_FROM_EMAIL and throws if present but empty", () => {
    expect(parseServerEnv(validServerEnv)).toEqual(validServerEnv);
    expect(() =>
      parseServerEnv({ ...validServerEnv, RESEND_FROM_EMAIL: "" }),
    ).toThrow(/RESEND_FROM_EMAIL/);
  });

  it("throws if OPENAI_API_KEY is present but empty", () => {
    expect(() =>
      parseServerEnv({ ...validServerEnv, OPENAI_API_KEY: "" }),
    ).toThrow(/OPENAI_API_KEY/);
  });
});
