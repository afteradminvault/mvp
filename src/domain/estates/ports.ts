/**
 * Estate domain contracts. Framework-free, same rationale as
 * src/domain/auth/ports.ts — this is the boundary the domain layer depends
 * on; src/infrastructure/estates/supabase-estate-repository.ts implements it.
 */

export type EstateStatus =
  | "setup"
  | "draft"
  | "active_living"
  | "checkin_overdue"
  | "death_reported"
  | "verifying"
  | "awaiting_death_certificate"
  | "active_executor"
  | "closed";

export interface Estate {
  id: string;
  /**
   * Nullable per PRD v2 §0/§8 Q1 — a Case opened by a Family member for
   * someone already deceased may have no living "owner" account at all.
   * Nothing in this codebase populates a null value yet (create_case()
   * still always sets it); this just stops the type from lying once the
   * Case Management epic starts exercising that path.
   */
  ownerUserId: string | null;
  jurisdictionId: string;
  displayName: string;
  status: EstateStatus;
  checkInIntervalDays: number;
  lastCheckInAt: string;
  gracePeriodDays: number;
  verificationStartedAt: string | null;
  selfCancelWindowDays: number;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  /** PRD v2 §3.2's deceased-profile sub-object — populated by createDraftCase(), null on cases created via the older createEstate() path. */
  deceasedFullName: string | null;
  deceasedDateOfBirth: string | null;
  deceasedRelationship: string | null;
  /** Optional even once populated elsewhere — a case may be opened pre-death (Section 0 of PRD v2). */
  deceasedDateOfDeath: string | null;
  /** Onboarding progress (Database Schema v2 §2.3) — null step means onboarding hasn't started or has completed. */
  draftStep: string | null;
  draftPayload: Record<string, unknown>;
  /** Will Builder epic — true only when the account holder IS the person the case is about (the testator), never inferred from deceasedRelationship. Gates whether a will can be created for this case. */
  isSelfPlanned: boolean;
  /** Two-Brand Foundation (Schema Addendum §2.3) — attribution only, never an access-control input. Powers future "cases by brand" admin reporting. */
  acquisitionBrand: string;
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

/** create_draft_case() input (PRD v2 §3.2, US-2.1) — the onboarding entry point, distinct from CreateEstateInput's older /estates/new path. */
export interface CreateDraftCaseInput {
  jurisdictionId: string;
  deceasedFullName: string;
  deceasedDateOfBirth: string;
  deceasedRelationship: string;
  /** Blank = pre-death/planning-ahead (PRD v2 §0); filled in = post-death. */
  deceasedDateOfDeath?: string | null;
  checkInIntervalDays?: number;
  /** Will Builder epic — set only by the dedicated /wills/new entry point. */
  isSelfPlanned?: boolean;
  /** Two-Brand Foundation (Schema Addendum §2.3) — resolved server-side from the request, never client-supplied. Independent of the creating user's own acquisition_brand. */
  acquisitionBrand?: string;
}

export interface SaveDraftProgressInput {
  draftStep: string;
  /** Merged into the existing draft_payload by the service layer, not replaced — see EstateService.saveDraftProgress. */
  draftPayload: Record<string, unknown>;
}

export interface EstateRepository {
  createEstate(input: CreateEstateInput): Promise<Estate>;
  getEstate(estateId: string): Promise<Estate | null>;
  updateEstate(estateId: string, input: UpdateEstateInput): Promise<Estate>;
  recordCheckIn(estateId: string): Promise<Estate>;
  listMyEstates(): Promise<Estate[]>;
  listSupportedJurisdictions(): Promise<Jurisdiction[]>;
  /** create_draft_case() RPC — creates a case in 'draft' status, deceased profile required. */
  createDraftCase(input: CreateDraftCaseInput): Promise<Estate>;
  /** Plain UPDATE through cases_update_owner RLS — draft_step/draft_payload aren't guarded by the status-transition trigger. */
  saveDraftProgress(estateId: string, input: SaveDraftProgressInput): Promise<Estate>;
  /** activate_draft_case() RPC — the only path from 'draft' to 'active_living'. */
  activateDraftCase(estateId: string): Promise<Estate>;
}
