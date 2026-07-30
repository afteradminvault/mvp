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

type RouteParams = { params: Promise<{ id: string }> };

/** Will Builder — GET is idempotent create-if-missing (a self-planned Case has at most one will), so the wizard's first load never needs a separate "create" step. */
export async function GET(_request: Request, { params }: RouteParams) {
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
    const bequests = await service.listBequests(will.id);
    return NextResponse.json({ will, bequests });
  } catch (error) {
    return willErrorResponse(error);
  }
}
