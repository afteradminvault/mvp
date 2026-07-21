import type { ReadinessFacts, ReadinessRepository, ReadinessScore } from "./ports";

export class ReadinessForbiddenError extends Error {}

function toPercent(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

/**
 * The four inputs to the readiness score, per PRD §4.1: % of assets with
 * instructions set, executor confirmed, MFA enabled, and a designated
 * backup/fallback contact. The PRD's exact phrase is "whether a death
 * certificate contact/backup exists" — interpreted here as a designated
 * Backup Executor (an accepted `executor`-role member with
 * `fallback_order` set), since nothing in the schema models a distinct
 * "death certificate contact" entity, and a backup executor is the
 * concrete, already-built mechanism (Security Architecture §1.4's
 * resolved redundancy model) that serves the same practical purpose:
 * someone besides the primary who can act if the primary can't.
 */
export function scoreReadiness(facts: ReadinessFacts): ReadinessScore {
  const assetsWithInstructionsPercent = toPercent(facts.assetsWithInstructionsCount, facts.totalAssetCount);
  const executorConfirmed = facts.hasAcceptedExecutor;
  const mfaEnabled = facts.ownerMfaEnabled;
  const backupExecutorConfigured = facts.hasAcceptedBackupExecutor;

  const overallPercent = Math.round(
    (assetsWithInstructionsPercent +
      (executorConfirmed ? 100 : 0) +
      (mfaEnabled ? 100 : 0) +
      (backupExecutorConfigured ? 100 : 0)) /
      4,
  );

  return { overallPercent, assetsWithInstructionsPercent, executorConfirmed, mfaEnabled, backupExecutorConfigured };
}

export class ReadinessService {
  constructor(private readonly repository: ReadinessRepository) {}

  async getReadinessScore(estateId: string): Promise<ReadinessScore> {
    try {
      const facts = await this.repository.getReadinessFacts(estateId);
      return scoreReadiness(facts);
    } catch (error) {
      if (error instanceof Error && /only the estate owner/i.test(error.message)) {
        throw new ReadinessForbiddenError("Only the estate owner can view its readiness score.");
      }
      throw error;
    }
  }
}
