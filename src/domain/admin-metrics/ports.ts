/**
 * Admin overview metrics domain contracts (Database Schema §3.8, PRD v2
 * §3.8, US-8.1). Framework-free, same rationale as the other ports.ts
 * files. MRR/churn/subscriptions are deliberately absent — there is no
 * subscriptions table in this schema yet (billing was explicitly deferred
 * before this milestone started); this is the four metrics that ARE
 * meaningful today.
 */
export interface AdminOverviewMetrics {
  userCount: number;
  activeCaseCount: number;
  accountsClosedCount: number;
  vaultItemCount: number;
}

export interface AdminMetricsRepository {
  getOverviewMetrics(): Promise<AdminOverviewMetrics>;
}