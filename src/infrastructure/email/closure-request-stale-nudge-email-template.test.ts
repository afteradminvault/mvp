import { describe, expect, it } from "vitest";
import { renderClosureRequestStaleNudgeEmail } from "./closure-request-stale-nudge-email-template";

describe("renderClosureRequestStaleNudgeEmail", () => {
  it("includes the estate name, asset category, status, and days stale", () => {
    const email = renderClosureRequestStaleNudgeEmail({
      toEmail: "marcus@example.com",
      estateDisplayName: "Diane's Estate",
      assetCategory: "financial",
      status: "submitted",
      daysSinceLastStatusChange: 17,
      closureRequestUrl: "https://example.com/estates/estate-1/assets/asset-1",
    });

    expect(email.subject).toContain("Diane's Estate");
    expect(email.html).toContain("financial");
    expect(email.html).toContain("submitted");
    expect(email.html).toContain("17 days");
    expect(email.html).toContain("https://example.com/estates/estate-1/assets/asset-1");
    expect(email.text).toContain("17 days");
    expect(email.text).toContain("https://example.com/estates/estate-1/assets/asset-1");
  });

  it("escapes HTML-significant characters in the estate display name", () => {
    const email = renderClosureRequestStaleNudgeEmail({
      toEmail: "marcus@example.com",
      estateDisplayName: "<script>alert(1)</script>",
      assetCategory: "financial",
      status: "submitted",
      daysSinceLastStatusChange: 17,
      closureRequestUrl: "https://example.com/estates/estate-1/assets/asset-1",
    });

    expect(email.html).not.toContain("<script>alert(1)</script>");
    expect(email.html).toContain("&lt;script&gt;");
  });
});
