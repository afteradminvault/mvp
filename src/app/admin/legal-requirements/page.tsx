import Link from "next/link";
import { AdminLegalRequirementService } from "@/domain/admin-legal-requirements/admin-legal-requirement-service";
import { SupabaseAdminLegalRequirementRepository } from "@/infrastructure/admin-legal-requirements/supabase-admin-legal-requirement-repository";
import { AdminJurisdictionService } from "@/domain/admin-jurisdictions/admin-jurisdiction-service";
import { SupabaseAdminJurisdictionRepository } from "@/infrastructure/admin-jurisdictions/supabase-admin-jurisdiction-repository";
import { requirePlatformAdminForPage } from "../require-platform-admin-page";
import { LegalRequirementsAdminClient } from "./legal-requirements-admin-client";

export default async function AdminLegalRequirementsPage() {
  const supabase = await requirePlatformAdminForPage();
  const requirementService = new AdminLegalRequirementService(
    new SupabaseAdminLegalRequirementRepository(supabase),
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
      <h1 className="mt-2 mb-2 text-2xl font-semibold">Legal requirements</h1>
      <p className="mb-6 rounded bg-yellow-50 p-3 text-sm text-yellow-900">
        ⚠️ This content is a structural starting point, not verified legal guidance — see
        docs/LEGAL_COMPLIANCE.md. Rows marked <strong>pending counsel review</strong> correspond directly to that
        document&apos;s §1.4 🚩 items (state-by-state thresholds, RUFADAA adoption variants) and must not be
        presented to users as final.
      </p>
      <LegalRequirementsAdminClient initialRequirements={requirements} jurisdictions={jurisdictions} />
    </main>
  );
}
