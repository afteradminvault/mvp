import type { Estate } from "@/domain/estates/ports";

/**
 * Death reporting + verification workflow contracts (Milestone 2 feature 3,
 * Security Architecture §4.1/§4.2). The actual state transitions and their
 * guards live in Postgres functions (report_death, self_cancel —
 * supabase/migrations/20260723000200_death_verification_functions.sql),
 * not here — this layer is the boundary the domain service depends on to
 * invoke them and to look up who to notify.
 */
export interface DeathVerificationRepository {
  reportDeath(estateId: string): Promise<Estate>;
  selfCancel(estateId: string): Promise<Estate>;
  getOwnerEmail(estateId: string): Promise<string>;
}
