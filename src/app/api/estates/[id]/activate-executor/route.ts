import { NextResponse } from "next/server";
import { DocumentService } from "@/domain/documents/document-service";
import { SupabaseDocumentRepository } from "@/infrastructure/documents/supabase-document-repository";
import { requireSession } from "@/app/api/_lib/require-session";
import { documentErrorResponse } from "@/app/api/_lib/document-error-response";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * Re-triggers the death-certificate gate check (activate_executor RPC,
 * supabase/migrations/20260724000000_documents_storage_and_activation.sql)
 * — covers a death_certificate uploaded before the self-cancel window
 * lapsed, so the automatic check inside the upload route
 * (src/app/api/estates/[id]/documents/route.ts) hadn't reached
 * awaiting_death_certificate yet. Calls the exact same RPC as that
 * automatic path; there is no separate authorization logic here to get
 * out of sync with it.
 */
export async function POST(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const service = new DocumentService(new SupabaseDocumentRepository(session.supabase));
  try {
    const estate = await service.activateExecutorIfCertified(id);
    if (!estate) {
      return NextResponse.json(
        { error: "This estate isn't awaiting a death certificate, or none has been attached yet." },
        { status: 409 },
      );
    }
    return NextResponse.json({ estate });
  } catch (error) {
    return documentErrorResponse(error);
  }
}
