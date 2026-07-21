import type { ReadinessScore } from "@/domain/readiness/ports";

function ChecklistItem({ label, done }: { label: string; done: boolean }) {
  return (
    <li className="flex items-center gap-2">
      <span className={done ? "text-green-600" : "text-gray-400"}>{done ? "✓" : "○"}</span>
      {label}
    </li>
  );
}

export function ReadinessCard({ score }: { score: ReadinessScore }) {
  return (
    <div className="rounded border border-gray-300 p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg font-medium">Readiness</h2>
        <span className="text-2xl font-semibold">{score.overallPercent}%</span>
      </div>
      <ul className="flex flex-col gap-1 text-sm">
        <ChecklistItem
          label={`Assets with instructions set (${score.assetsWithInstructionsPercent}%)`}
          done={score.assetsWithInstructionsPercent === 100}
        />
        <ChecklistItem label="Executor confirmed" done={score.executorConfirmed} />
        <ChecklistItem label="Two-factor authentication enabled" done={score.mfaEnabled} />
        <ChecklistItem label="Backup Executor configured" done={score.backupExecutorConfigured} />
      </ul>
    </div>
  );
}
