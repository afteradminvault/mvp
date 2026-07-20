/**
 * Estate domain contracts. Framework-free, same rationale as
 * src/domain/auth/ports.ts — this is the boundary the domain layer depends
 * on; src/infrastructure/estates/supabase-estate-repository.ts implements it.
 */

export type EstateStatus =
  | "setup"
  | "active_living"
  | "checkin_overdue"
  | "death_reported"
  | "verifying"
  | "awaiting_death_certificate"
  | "active_executor"
  | "closed";

export interface Estate {
  id: string;
  ownerUserId: string;
  jurisdictionId: string;
  displayName: string;
  status: EstateStatus;
  checkInIntervalDays: number;
  lastCheckInAt: string;
  gracePeriodDays: number;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface Jurisdiction {
  id: string;
  countryCode: string;
  regionCode: string | null;
  displayName: string;
}

export interface CreateEstateInput {
  displayName: string;
  jurisdictionId: string;
  checkInIntervalDays?: number;
}

export interface UpdateEstateInput {
  displayName?: string;
  checkInIntervalDays?: number;
  gracePeriodDays?: number;
}

export interface EstateRepository {
  createEstate(input: CreateEstateInput): Promise<Estate>;
  getEstate(estateId: string): Promise<Estate | null>;
  updateEstate(estateId: string, input: UpdateEstateInput): Promise<Estate>;
  recordCheckIn(estateId: string): Promise<Estate>;
  listMyEstates(): Promise<Estate[]>;
  listSupportedJurisdictions(): Promise<Jurisdiction[]>;
}
