import Link from "next/link";
import { AdminWillExecutionRequirementService } from "@/domain/admin-will-execution-requirements/admin-will-execution-requirement-service";
import { SupabaseAdminWillExecutionRequirementRepository } from "@/infrastructure/admin-will-execution-requirements/supabase-admin-will-execution-requirement-repository";
import { AdminJurisdictionService } from "@/domain/admin-jurisdictions/admin-jurisdiction-service";
import { SupabaseAdminJurisdictionRepository } from "@/infrastructure/admin-jurisdictions/supabase-admin-jurisdiction-repository";
import { requirePlatformAdminForPage } from "../require-platform-admin-page";
import { WillExecutionRequirementsAdminClient } from "./will-execution-requirements-admin-client";

export default async function AdminWillExecutionRequirementsPage() {
  const supabase = await requirePlatformAdminForPage();
  const requirementService = new AdminWillExecutionRequirementService(
    new SupabaseAdminWillExecutionRequirementRepository(supabase),
  );
  const jurisdictionService = new AdminJurisdictionService(new SupabaseAdminJurisdictionRepository(supabase));

  const [requirements, jurisdictions] = await Promise.all([
    requirementService.listRequirements(),
    jurisdictionService.listJurisdictions(),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <Link href="/admin" className="text-sm underline">
        &larr; Admin
      </Link>
      <h1 className="mt-2 mb-2 text-2xl font-semibold">Will execution requirements</h1>
      <p className="mb-6 rounded bg-yellow-50 p-3 text-sm text-yellow-900">
        ⚠️ This table ships empty deliberately — witness/notarization requirements are genuinely
        state-variable and no content here has been verified against actual jurisdiction law. Every row
        defaults to <strong>pending counsel review</strong>; do not clear that flag without real legal
        review. Until a jurisdiction has a row here, the Will wizard refuses to generate a final document
        for testators in it.
      </p>
      <WillExecutionRequirementsAdminClient initialRequirements={requirements} jurisdictions={jurisdictions} />
    </main>
  );
}
