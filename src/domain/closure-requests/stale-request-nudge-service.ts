import type { DigitalAssetRepository } from "@/domain/assets/ports";
import type { EstateRepository } from "@/domain/estates/ports";
import type { EstateMember, MembershipRepository } from "@/domain/membership/ports";
import type { EmailSender } from "@/domain/notifications/ports";
import type { ClosureRequestRepository } from "./ports";

export const DEFAULT_STALE_THRESHOLD_DAYS = 14;

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Assigned executor if still an accepted member, else every accepted executor — "Recipient: Executor" per PRD §5, not a specific person. */
function resolveRecipientEmails(members: EstateMember[], assignedToUserId: string | null): string[] {
  const acceptedExecutors = members.filter((member) => member.role === "executor" && member.inviteStatus === "accepted");
  if (assignedToUserId) {
    const assigned = acceptedExecutors.find((member) => member.userId === assignedToUserId);
    if (assigned) return [assigned.inviteEmail];
  }
  return acceptedExecutors.map((member) => member.inviteEmail);
}

/**
 * Orchestrates the stale-closure-request nudge sweep (Milestone 2 feature
 * 8, PRD §5), called by the daily cron route. Unlike the dead-man's-switch
 * sweep wrappers in src/infrastructure/dead-mans-switch/, this has real
 * business logic — recipient resolution, email content assembly — so it's
 * a proper domain service over ports, not a thin RPC pass-through.
 */
export class StaleClosureRequestNudgeService {
  constructor(
    private readonly closureRequestRepository: ClosureRequestRepository,
    private readonly estateRepository: EstateRepository,
    private readonly membershipRepository: MembershipRepository,
    private readonly assetRepository: DigitalAssetRepository,
    private readonly emailSender: EmailSender,
  ) {}

  async sendNudges(
    baseUrl: string,
    thresholdDays: number = DEFAULT_STALE_THRESHOLD_DAYS,
  ): Promise<{ staleRequestCount: number; emailsSent: number }> {
    const staleRequests = await this.closureRequestRepository.markStaleRequestsNeedingNudge(thresholdDays);
    let emailsSent = 0;

    for (const request of staleRequests) {
      const [estate, members, asset] = await Promise.all([
        this.estateRepository.getEstate(request.estateId),
        this.membershipRepository.listMembers(request.estateId),
        this.assetRepository.getAsset(request.digitalAssetId),
      ]);
      if (!estate || !asset) continue;

      const recipientEmails = resolveRecipientEmails(members, request.assignedToUserId);
      const daysSinceLastStatusChange = Math.floor(
        (Date.now() - new Date(request.lastStatusChangeAt).getTime()) / MS_PER_DAY,
      );
      const closureRequestUrl = new URL(
        `/estates/${request.estateId}/assets/${request.digitalAssetId}`,
        baseUrl,
      ).toString();

      for (const toEmail of recipientEmails) {
        const sent = await this.emailSender.sendClosureRequestStaleNudgeEmail({
          toEmail,
          estateDisplayName: estate.displayName,
          assetCategory: asset.category,
          status: request.status,
          daysSinceLastStatusChange,
          closureRequestUrl,
        });
        if (sent) emailsSent += 1;
      }
    }

    return { staleRequestCount: staleRequests.length, emailsSent };
  }
}
