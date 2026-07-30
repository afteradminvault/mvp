import { renderTextPdf } from "@/infrastructure/pdf/render-text-pdf";

/** Every generateDocument() call stores a fresh PDF, same reasoning as notification letters — see render-text-pdf.ts's own comment for why this is shared. */
export async function generateWillPdf(input: { testatorFullName: string; content: string }): Promise<Uint8Array> {
  return renderTextPdf(input.content);
}
