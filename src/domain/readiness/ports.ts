/**
 * Readiness-score domain contracts (PRD §4.1, API Specification §2).
 * Framework-free, same rationale as the other ports.ts files. The
 * repository exposes raw facts only — the scoring math (percentages,
 * rounding, the zero-assets edge case) is business logic that belongs in
 * the service, not scattered across a SQL query.
 */

export interface ReadinessFacts {
  totalAssetCount: number;
  assetsWithInstructionsCount: number;
  hasAcceptedExecutor: boolean;
  ownerMfaEnabled: boolean;
  hasAcceptedBackupExecutor: boolean;
}

export interface ReadinessScore {
  overallPercent: number;
  assetsWithInstructionsPercent: number;
  executorConfirmed: boolean;
  mfaEnabled: boolean;
  backupExecutorConfigured: boolean;
}

export interface ReadinessRepository {
  getReadinessFacts(estateId: string): Promise<ReadinessFacts>;
}
