import { describe, expect, it } from "vitest";
import { renderNominationInviteEmail } from "./nomination-invite-email-template";

describe("renderNominationInviteEmail", () => {
  it("includes the invite URL, estate name, and role for an executor", () => {
    const email = renderNominationInviteEmail({
      toEmail: "marcus@example.com",
      estateDisplayName: "Diane's Estate",
      role: "executor",
      inviteUrl: "https://example.com/invites/abc123",
    });

    expect(email.subject).toMatch(/Executor/);
    expect(email.html).toContain("https://example.com/invites/abc123");
    expect(email.html).toContain("Diane&#39;s Estate");
    expect(email.text).toContain("https://example.com/invites/abc123");
    expect(email.text).toContain("Diane's Estate");
  });

  it("uses Helper-specific language for a helper invite", () => {
    const email = renderNominationInviteEmail({
      toEmail: "sister@example.com",
      estateDisplayName: "Diane's Estate",
      role: "helper",
      inviteUrl: "https://example.com/invites/def456",
    });

    expect(email.subject).toMatch(/Helper/);
    expect(email.html).toMatch(/without access to the private vault contents/);
  });

  it("escapes HTML-significant characters in the estate display name", () => {
    const email = renderNominationInviteEmail({
      toEmail: "marcus@example.com",
      estateDisplayName: "<script>alert(1)</script>",
      role: "executor",
      inviteUrl: "https://example.com/invites/abc123",
    });

    expect(email.html).not.toContain("<script>alert(1)</script>");
    expect(email.html).toContain("&lt;script&gt;");
  });
});
