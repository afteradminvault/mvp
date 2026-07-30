import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { generateNotificationLetterPdf } from "./generate-notification-letter-pdf";

describe("generateNotificationLetterPdf", () => {
  it("produces a valid, loadable single-page PDF for a short letter", async () => {
    const bytes = await generateNotificationLetterPdf({ platformName: "Chase", content: "Dear Chase,\n\nPlease close this account.\n\nSincerely,\nMarcus" });

    expect(bytes.byteLength).toBeGreaterThan(0);
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(1);
  });

  it("wraps onto multiple pages for long content", async () => {
    const longContent = Array.from({ length: 120 }, (_, i) => `This is line number ${i} of a very long notification letter body.`).join("\n\n");

    const bytes = await generateNotificationLetterPdf({ platformName: "Chase", content: longContent });

    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBeGreaterThan(1);
  });

  it("handles empty lines (paragraph breaks) without throwing", async () => {
    const bytes = await generateNotificationLetterPdf({ platformName: "Chase", content: "First paragraph.\n\nSecond paragraph." });

    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(1);
  });
});
