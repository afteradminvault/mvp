import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/**
 * Shared word-wrap/pagination core for every plain-text-to-PDF generator
 * in this codebase (notification letters, wills) — pdf-lib doesn't wrap
 * text itself. Extracted here once a second real call site needed the
 * identical logic (src/infrastructure/wills/generate-will-pdf.ts) —
 * before that, src/infrastructure/notification-letters/
 * generate-notification-letter-pdf.ts carried this inline.
 */
const PAGE_WIDTH = 612; // US Letter, points
const PAGE_HEIGHT = 792;
const MARGIN = 72;
const FONT_SIZE = 11;
const LINE_HEIGHT = FONT_SIZE * 1.4;

export async function renderTextPdf(content: string): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const maxWidth = PAGE_WIDTH - MARGIN * 2;

  const lines = content.split("\n").flatMap((paragraph) => wrapLine(paragraph, font, FONT_SIZE, maxWidth));

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  for (const line of lines) {
    if (y < MARGIN) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
    page.drawText(line, { x: MARGIN, y, size: FONT_SIZE, font, color: rgb(0, 0, 0) });
    y -= LINE_HEIGHT;
  }

  return pdfDoc.save();
}

function wrapLine(line: string, font: Awaited<ReturnType<PDFDocument["embedFont"]>>, size: number, maxWidth: number): string[] {
  if (line.length === 0) return [""];

  const words = line.split(" ");
  const wrapped: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      wrapped.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) wrapped.push(current);

  return wrapped;
}
