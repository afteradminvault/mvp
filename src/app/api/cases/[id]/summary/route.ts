import { NextResponse } from "next/server";
import { AssetService } from "@/domain/assets/asset-service";
import { SupabaseDigitalAssetRepository } from "@/infrastructure/assets/supabase-asset-repository";
import { DocumentService } from "@/domain/documents/document-service";
import { SupabaseDocumentRepository } from "@/infrastructure/documents/supabase-document-repository";
import { MembershipService } from "@/domain/membership/membership-service";
import { SupabaseMembershipRepository } from "@/infrastructure/membership/supabase-membership-repository";
import { requireSession } from "@/app/api/_lib/require-session";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * US-2.6 — "Onboarding summary screen with clear next steps... documents
 * still needed, accounts still needing action, and whether an Executor
 * has been invited." Pure aggregation over three already-existing
 * services, no new repository — the onboarding summary page itself
 * fetches this data directly (same pattern as every other page in this
 * app), this route exists for API-family completeness/testability, same
 * rationale as GET /api/cases/:id.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const assetService = new AssetService(new SupabaseDigitalAssetRepository(session.supabase));
  const documentService = new DocumentService(new SupabaseDocumentRepository(session.supabase));
  const membershipService = new MembershipService(new SupabaseMembershipRepository(session.supabase));

  try {
    const [assets, documents, members] = await Promise.all([
      assetService.listAssets(id),
      documentService.listDocuments(id),
      membershipService.listMembers(id),
    ]);

    return NextResponse.json({
      summary: {
        accountCount: assets.length,
        hasDeathCertificate: documents.some((doc) => doc.documentType === "death_certificate"),
        executorInvited: members.some((member) => member.role === "executor"),
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
