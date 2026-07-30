import { describe, expect, it } from "vitest";
import { renderNotificationLetterContent } from "./render-notification-letter";

describe("renderNotificationLetterContent", () => {
  it("includes the deceased's name, sender, case name, and platform, with the date of death", () => {
    const content = renderNotificationLetterContent({
      deceasedFullName: "Diane Whitfield",
      dateOfDeath: "2026-07-01",
      senderDisplayName: "Marcus Whitfield",
      caseDisplayName: "Diane Whitfield's Case",
      platformName: "Chase",
      letterType: "close",
    });

    expect(content).toContain("Diane Whitfield");
    expect(content).toContain("Marcus Whitfield");
    expect(content).toContain("Diane Whitfield's Case");
    expect(content).toContain("Chase");
    expect(content).toContain("July 1, 2026");
  });

  it("omits the date-of-death clause when it isn't on file", () => {
    const content = renderNotificationLetterContent({
      deceasedFullName: "Diane Whitfield",
      dateOfDeath: null,
      senderDisplayName: "Marcus Whitfield",
      caseDisplayName: "Diane Whitfield's Case",
      platformName: "Chase",
      letterType: "close",
    });

    expect(content).not.toMatch(/on \w+ \d{1,2}, \d{4}/);
  });

  it("requests closure for letterType='close'", () => {
    const content = renderNotificationLetterContent({
      deceasedFullName: "Diane Whitfield",
      dateOfDeath: null,
      senderDisplayName: "Marcus Whitfield",
      caseDisplayName: "Diane Whitfield's Case",
      platformName: "Chase",
      letterType: "close",
    });

    expect(content).toContain("be closed");
    expect(content).not.toContain("be memorialized");
  });

  it("requests memorialization for letterType='memorialize'", () => {
    const content = renderNotificationLetterContent({
      deceasedFullName: "Diane Whitfield",
      dateOfDeath: null,
      senderDisplayName: "Marcus Whitfield",
      caseDisplayName: "Diane Whitfield's Case",
      platformName: "Facebook",
      letterType: "memorialize",
    });

    expect(content).toContain("be memorialized");
    expect(content).not.toContain("be closed");
  });
});
