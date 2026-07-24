import type { Estate } from "@/domain/estates/ports";
import type { DeathVerificationRepository } from "./ports";

export class DeathVerificationForbiddenError extends Error {}
export class DeathVerificationInvalidStateError extends Error {}

/** Every function in this domain raises a plain Postgres exception; this maps their messages to typed errors, once, in one place. */
function translateRepositoryError(error: unknown): never {
  if (error instanceof Error) {
    if (/only an accepted executor or helper may report a death/i.test(error.message)) {
      throw new DeathVerificationForbiddenError(error.message);
    }
    if (
      /this estate is not in a state that can be reported/i.test(error.message) ||
      /self-cancel is only available to the estate owner while status is verifying/i.test(error.message)
    ) {
      throw new DeathVerificationInvalidStateError(error.message);
    }
  }
  throw error;
}

/**
 * Orchestrates report-death and self-cancel (Milestone 2 feature 3,
 * Security Architecture §4.1/§4.2). No business logic to validate here —
 * both operations take only an estate id, already validated as a route
 * param — this service's value is translating the database functions'
 * raw exception messages into typed errors the API layer can map to HTTP
 * status codes, same role as MembershipService.
 */
export class DeathVerificationService {
  constructor(private readonly repository: DeathVerificationRepository) {}

  async reportDeath(estateId: string): Promise<Estate> {
    try {
      return await this.repository.reportDeath(estateId);
    } catch (error) {
      translateRepositoryError(error);
    }
  }

  async selfCancel(estateId: string): Promise<Estate> {
    try {
      return await this.repository.selfCancel(estateId);
    } catch (error) {
      translateRepositoryError(error);
    }
  }

  async getOwnerEmail(estateId: string): Promise<string> {
    return this.repository.getOwnerEmail(estateId);
  }
}
