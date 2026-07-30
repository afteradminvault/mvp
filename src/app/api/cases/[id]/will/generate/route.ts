import { NextResponse } from "next/server";
import { WillService } from "@/domain/wills/will-service";
import { SupabaseWillRepository } from "@/infrastructure/wills/supabase-will-repository";
import { SupabaseEstateRepository } from "@/infrastructure/estates/supabase-estate-repository";
import { SupabaseAdminWillExecutionRequirementRepository } from "@/infrastructure/admin-will-execution-requirements/supabase-admin-will-execution-requirement-repository";
import { SupabaseDigitalAssetRepository } from "@/infrastructure/assets/supabase-asset-repository";
import { SupabaseBeneficiaryRepository } from "@/infrastructure/beneficiaries/supabase-beneficiary-repository";
import { SupabaseDocumentRepository } from "@/infrastructure/documents/supabase-document-repository";
import { requireSession } from "@/app/api/_lib/require-session";
import { willErrorResponse } from "@/app/api/_lib/will-error-response";
import { writeAuditLog } from "@/app/api/_lib/audit-log";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * Composes and stores a new will document — see WillService.generateDocument's
 * own comment for the full composition + the refusal when no execution
 * requirements exist for the testator's jurisdiction.
 */
export async function POST(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const service = new WillService(
    new SupabaseWillRepository(session.supabase),
    new SupabaseEstateRepository(session.supabase),
    new SupabaseAdminWillExecutionRequirementRepository(session.supabase),
    new SupabaseDigitalAssetRepository(session.supabase),
    new SupabaseBeneficiaryRepository(session.supabase),
    new SupabaseDocumentRepository(session.supabase),
  );
  try {
    const will = await service.getOrCreateWill(id);
    const generated = await service.generateDocument(will.id, id, session.userId);
    await writeAuditLog(session.supabase, {
      estateId: id,
      actorUserId: session.userId,
      eventType: "will_generated",
      targetTable: "wills",
      targetId: generated.id,
    });
    return NextResponse.json({ will: generated });
  } catch (error) {
    return willErrorResponse(error);
  }
}
