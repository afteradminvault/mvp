import type { AdminMetricsRepository, AdminOverviewMetrics } from "./ports";

/** Thin orchestration, matching every other domain's layering — get_admin_overview_metrics() (SECURITY DEFINER) is the actual authorization + aggregation boundary, not this service. */
export class AdminMetricService {
  constructor(private readonly repository: AdminMetricsRepository) {}

  async getOverviewMetrics(): Promise<AdminOverviewMetrics> {
    return this.repository.getOverviewMetrics();
  }
}
