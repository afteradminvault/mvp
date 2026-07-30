import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminMetricsRepository, AdminOverviewMetrics } from "@/domain/admin-metrics/ports";

interface MetricsRow {
  user_count: number;
  active_case_count: number;
  accounts_closed_count: number;
  vault_item_count: number;
}

/** get_admin_overview_metrics() (SECURITY DEFINER) does the is_platform_admin() check and the aggregation itself — see the migration's own comment for why this is an RPC rather than plain SELECTs against per-case-scoped tables. */
export class SupabaseAdminMetricsRepository implements AdminMetricsRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async getOverviewMetrics(): Promise<AdminOverviewMetrics> {
    const { data, error } = await this.supabase.rpc("get_admin_overview_metrics");
    if (error) throw error;
    const row = (data as MetricsRow[])[0];
    return {
      userCount: Number(row.user_count),
      activeCaseCount: Number(row.active_case_count),
      accountsClosedCount: Number(row.accounts_closed_count),
      vaultItemCount: Number(row.vault_item_count),
    };
  }
}
