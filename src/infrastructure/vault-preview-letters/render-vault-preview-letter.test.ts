import { describe, expect, it } from "vitest";
import { renderVaultPreviewLetter } from "./render-vault-preview-letter";

describe("renderVaultPreviewLetter 🔒 security", () => {
  it("renders human-readable counts for every item type, in both html and text", () => {
    const { html, text } = renderVaultPreviewLetter({
      caseDisplayName: "Diane Whitfield's Case",
      itemTypeSummary: { password: 3, crypto_seed_phrase: 1, bank_detail: 2 },
      generatedAt: "2026-07-31T00:00:00.000Z",
    });

    expect(html).toContain("3 passwords");
    expect(html).toContain("1 crypto seed phrase");
    expect(html).toContain("2 bank details");
    expect(text).toContain("3 passwords");
    expect(text).toContain("1 crypto seed phrase");
    expect(text).toContain("2 bank details");
  });

  it("omits item types with a zero count", () => {
    const { html } = renderVaultPreviewLetter({
      caseDisplayName: "Diane Whitfield's Case",
      itemTypeSummary: { password: 2, bank_detail: 0 },
      generatedAt: "2026-07-31T00:00:00.000Z",
    });

    expect(html).toContain("2 passwords");
    expect(html).not.toContain("bank detail");
  });

  it("shows an explicit empty state when there are no vault items", () => {
    const { html, text } = renderVaultPreviewLetter({
      caseDisplayName: "Diane Whitfield's Case",
      itemTypeSummary: {},
      generatedAt: "2026-07-31T00:00:00.000Z",
    });

    expect(html).toContain("No vault items are on file");
    expect(text).toContain("No vault items are on file");
  });

  it("escapes HTML-significant characters in the case display name", () => {
    const { html } = renderVaultPreviewLetter({
      caseDisplayName: "<script>alert(1)</script>",
      itemTypeSummary: { password: 1 },
      generatedAt: "2026-07-31T00:00:00.000Z",
    });

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("never contains a label, account identifier, or value beyond the case name and type counts, even given a deliberately adversarial summary", () => {
    // itemTypeSummary is typed to only ever hold VaultItemType keys, but
    // this proves the RENDERER itself has no code path that could ever
    // interpolate anything else — the security property holds even if a
    // future caller's type-safety were somehow bypassed (hence the cast).
    const adversarialSummary = {
      password: 2,
      "Chase Checking ****1234 — marcus@example.com": "sk_live_deadbeef00112233",
    } as unknown as Parameters<typeof renderVaultPreviewLetter>[0]["itemTypeSummary"];

    const { html, text } = renderVaultPreviewLetter({
      caseDisplayName: "Diane Whitfield's Case",
      itemTypeSummary: adversarialSummary,
      generatedAt: "2026-07-31T00:00:00.000Z",
    });

    expect(html).not.toContain("Chase Checking");
    expect(html).not.toContain("marcus@example.com");
    expect(html).not.toContain("sk_live_deadbeef00112233");
    expect(text).not.toContain("Chase Checking");
    expect(text).not.toContain("marcus@example.com");
    expect(text).not.toContain("sk_live_deadbeef00112233");
  });
});
