import { renderTextPdf } from "@/infrastructure/pdf/render-text-pdf";

/**
 * US-6.5 — the letter must be auto-stored as a PDF on every finalize path,
 * not just "download" (no print-dialog fallback is possible for the
 * email/copy paths, unlike src/infrastructure/vault-preview-letters, which
 * could lean on the browser's print-to-PDF).
 */
export async function generateNotificationLetterPdf(input: { platformName: string; content: string }): Promise<Uint8Array> {
  return renderTextPdf(input.content);
}
