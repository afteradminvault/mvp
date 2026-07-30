import { describe, expect, it } from "vitest";
import { renderNotificationLetterEmail } from "./notification-letter-email-template";

describe("renderNotificationLetterEmail", () => {
  it("uses the given subject and preserves the content as plain text", () => {
    const { subject, text } = renderNotificationLetterEmail({
      toEmail: "bereavement@chase.example",
      subject: "Notice regarding Chase account",
      content: "Dear Chase,\n\nPlease close this account.",
    });

    expect(subject).toBe("Notice regarding Chase account");
    expect(text).toBe("Dear Chase,\n\nPlease close this account.");
  });

  it("wraps blank-line-separated paragraphs in <p> tags for the html view", () => {
    const { html } = renderNotificationLetterEmail({
      toEmail: "bereavement@chase.example",
      subject: "Notice",
      content: "First paragraph.\n\nSecond paragraph.",
    });

    expect(html).toContain("<p>First paragraph.</p>");
    expect(html).toContain("<p>Second paragraph.</p>");
  });

  it("escapes HTML-significant characters in the content", () => {
    const { html } = renderNotificationLetterEmail({
      toEmail: "bereavement@chase.example",
      subject: "Notice",
      content: "<script>alert(1)</script>",
    });

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
