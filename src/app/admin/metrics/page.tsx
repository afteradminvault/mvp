import Link from "next/link";
import { AdminMetricService } from "@/domain/admin-metrics/admin-metric-service";
import { SupabaseAdminMetricsRepository } from "@/infrastructure/admin-metrics/supabase-admin-metrics-repository";
import { requirePlatformAdminForPage } from "../require-platform-admin-page";

/** US-8.1 — dense, utilitarian, aggregate counts only, no per-user drill-down from this screen (per the story's own AC). */
export default async function AdminMetricsPage() {
  const supabase = await requirePlatformAdminForPage();

  const service = new AdminMetricService(new SupabaseAdminMetricsRepository(supabase));
  const metrics = await service.getOverviewMetrics();

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Link href="/admin" className="text-sm underline">
        &larr; Admin
      </Link>
      <h1 className="mt-2 mb-1 text-2xl font-semibold">Overview metrics</h1>
      <p className="mb-6 text-sm text-gray-600">
        MRR/churn/subscriptions are omitted — there is no subscriptions table yet (billing is a later milestone).
      </p>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded border border-gray-300 p-4">
          <dt className="text-gray-600">Users</dt>
          <dd className="text-2xl font-semibold">{metrics.userCount}</dd>
        </div>
        <div className="rounded border border-gray-300 p-4">
          <dt className="text-gray-600">Active Cases</dt>
          <dd className="text-2xl font-semibold">{metrics.activeCaseCount}</dd>
        </div>
        <div className="rounded border border-gray-300 p-4">
          <dt className="text-gray-600">Accounts closed</dt>
          <dd className="text-2xl font-semibold">{metrics.accountsClosedCount}</dd>
        </div>
        <div className="rounded border border-gray-300 p-4">
          <dt className="text-gray-600">Vault items</dt>
          <dd className="text-2xl font-semibold">{metrics.vaultItemCount}</dd>
        </div>
      </dl>
    </main>
  );
}
