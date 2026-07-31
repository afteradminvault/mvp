import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { BRAND_OVERRIDE_COOKIE, resolveBrandId } from "./resolve-brand";

function makeRequest(url: string, cookieValue?: string): NextRequest {
  const request = new NextRequest(url);
  if (cookieValue !== undefined) {
    request.cookies.set(BRAND_OVERRIDE_COOKIE, cookieValue);
  }
  return request;
}

describe("resolveBrandId", () => {
  it("resolves afteradmin.co to afteradmin", () => {
    expect(resolveBrandId(makeRequest("https://afteradmin.co/"))).toBe("afteradmin");
  });

  it("resolves www.afteradmin.co to afteradmin", () => {
    expect(resolveBrandId(makeRequest("https://www.afteradmin.co/"))).toBe("afteradmin");
  });

  it("resolves aftervault.co to aftervault", () => {
    expect(resolveBrandId(makeRequest("https://aftervault.co/"))).toBe("aftervault");
  });

  it("is case-insensitive on hostname", () => {
    expect(resolveBrandId(makeRequest("https://AfterAdmin.co/"))).toBe("afteradmin");
  });

  it("honors a ?brand= query override on an unrecognized hostname", () => {
    expect(resolveBrandId(makeRequest("http://localhost:3000/?brand=afteradmin"))).toBe("afteradmin");
  });

  it("ignores an invalid ?brand= value", () => {
    expect(resolveBrandId(makeRequest("http://localhost:3000/?brand=not-a-brand"))).toBe("aftervault");
  });

  it("falls back to the override cookie when no query param is present", () => {
    expect(resolveBrandId(makeRequest("http://localhost:3000/", "afteradmin"))).toBe("afteradmin");
  });

  it("prefers the query param over the cookie when both are present", () => {
    expect(resolveBrandId(makeRequest("http://localhost:3000/?brand=aftervault", "afteradmin"))).toBe(
      "aftervault",
    );
  });

  it("defaults to aftervault on an unrecognized hostname with no override", () => {
    expect(resolveBrandId(makeRequest("http://localhost:3000/"))).toBe("aftervault");
  });

  it("prefers a real brand hostname over a query override", () => {
    expect(resolveBrandId(makeRequest("https://aftervault.co/?brand=afteradmin"))).toBe("aftervault");
  });
});
