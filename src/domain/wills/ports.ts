/**
 * Will Builder domain contracts. Framework-free, same rationale as the
 * other ports.ts files. Lives inside a self-planned Case
 * (cases.is_self_planned) — testator identity/DOB/jurisdiction are read
 * live from the parent case, never duplicated here, and the executor +
 * alternate are read live from case_members (role='executor', ordered by
 * fallback_order) rather than stored on the will at all.
 */
export type WillStatus = "draft" | "ready_to_sign" | "executed" | "superseded" | "revoked";

export type BequestCategory =
  | "real_property"
  | "financial_account"
  | "business_interest"
  | "personal_property"
  | "digital_asset"
  | "vehicle"
  | "other";

export interface Will {
  id: string;
  caseId: string;
  status: WillStatus;
  guardianFullName: string | null;
  guardianRelationship: string | null;
  alternateGuardianFullName: string | null;
  alternateGuardianRelationship: string | null;
  hasMinorChildren: boolean;
  residuaryBeneficiaryDescription: string | null;
  currentVersionId: string | null;
  executedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WillVersion {
  id: string;
  willId: string;
  content: string;
  generatedAt: string;
}

export interface WillBequest {
  id: string;
  willId: string;
  bequestCategory: BequestCategory;
  digitalAssetId: string | null;
  beneficiaryId: string | null;
  description: string | null;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateGuardianInfoInput {
  hasMinorChildren: boolean;
  guardianFullName?: string | null;
  guardianRelationship?: string | null;
  alternateGuardianFullName?: string | null;
  alternateGuardianRelationship?: string | null;
}

export interface CreateBequestInput {
  bequestCategory: BequestCategory;
  digitalAssetId?: string | null;
  beneficiaryId?: string | null;
  description?: string | null;
  displayOrder?: number;
}

export interface UpdateBequestInput {
  bequestCategory?: BequestCategory;
  digitalAssetId?: string | null;
  beneficiaryId?: string | null;
  description?: string | null;
  displayOrder?: number;
}

/** The two fields the render template needs about a nominated executor — resolved via case_members joined to users, not stored on the will. */
export interface WillExecutorSummary {
  displayName: string | null;
  inviteEmail: string;
  fallbackOrder: number | null;
}

export interface WillRepository {
  getWillByCaseId(caseId: string): Promise<Will | null>;
  createWill(caseId: string): Promise<Will>;
  getWill(willId: string): Promise<Will | null>;
  updateGuardianInfo(willId: string, input: UpdateGuardianInfoInput): Promise<Will>;
  updateResiduaryClause(willId: string, description: string | null): Promise<Will>;
  listBequests(willId: string): Promise<WillBequest[]>;
  createBequest(willId: string, input: CreateBequestInput): Promise<WillBequest>;
  updateBequest(bequestId: string, input: UpdateBequestInput): Promise<WillBequest>;
  deleteBequest(bequestId: string): Promise<void>;
  /** Freezes a new snapshot — never an in-place update of a prior version's content. */
  createVersion(willId: string, content: string): Promise<WillVersion>;
  setStatus(
    willId: string,
    status: WillStatus,
    extra?: { currentVersionId?: string; executedAt?: string | null },
  ): Promise<Will>;
  /** case_members role='executor', ordered by fallback_order — the existing nomination/invite flow, not will-specific data. */
  listExecutors(caseId: string): Promise<WillExecutorSummary[]>;
}
