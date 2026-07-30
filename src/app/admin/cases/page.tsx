import Link from "next/link";
import { AdminCaseService } from "@/domain/admin-cases/admin-case-service";
import { SupabaseAdminCaseRepository } from "@/infrastructure/admin-cases/supabase-admin-case-repository";
import { requirePlatformAdminForPage } from "../require-platform-admin-page";
import { AdminCasesClient } from "./admin-cases-client";

/** US-8.3 — review and flag Cases; ?flagged=true filters to the dedicated flagged view. */
export default async function AdminCasesPage({
  searchParams,
}: {
  searchParams: Promise<{ flagged?: string }>;
}) {
  const supabase = await requirePlatformAdminForPage();
  const { flagged } = await searchParams;

  const service = new AdminCaseService(new SupabaseAdminCaseRepository(supabase));
  const result = await service.listCases({ flaggedOnly: flagged === "true" });

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <Link href="/admin" className="text-sm underline">
        &larr; Admin
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold">Case oversight</h1>

      <div className="mb-4 flex gap-2 text-sm">
        <Link href="/admin/cases" className={!flagged ? "font-semibold underline" : "underline"}>
          All
        </Link>
        <Link href="/admin/cases?flagged=true" className={flagged === "true" ? "font-semibold underline" : "underline"}>
          Flagged only
        </Link>
      </div>

      <AdminCasesClient initialCases={result.cases} />
    </main>
  );
}
