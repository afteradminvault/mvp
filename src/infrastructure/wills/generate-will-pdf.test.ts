import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { generateWillPdf } from "./generate-will-pdf";

describe("generateWillPdf", () => {
  it("produces a valid, loadable PDF", async () => {
    const bytes = await generateWillPdf({ testatorFullName: "Marcus Whitfield", content: "LAST WILL AND TESTAMENT OF MARCUS WHITFIELD\n\nI revoke all prior wills." });

    expect(bytes.byteLength).toBeGreaterThan(0);
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("wraps onto multiple pages for long content", async () => {
    const longContent = Array.from({ length: 150 }, (_, i) => `This is clause number ${i} of a very long will document.`).join("\n\n");

    const bytes = await generateWillPdf({ testatorFullName: "Marcus Whitfield", content: longContent });

    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBeGreaterThan(1);
  });
});
