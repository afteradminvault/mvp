/**
 * Beneficiary domain contracts (Database Schema §4.3, API Specification
 * §7). Framework-free, same rationale as the other ports.ts files. Kept as
 * a distinct table/domain from estate_members — a beneficiary inherits an
 * asset's value and often never becomes an AfterVault user at all (Database
 * Schema §0.2).
 */
export interface Beneficiary {
  id: string;
  estateId: string;
  /** null = estate-wide/residual beneficiary rather than tied to one asset. */
  digitalAssetId: string | null;
  displayName: string;
  relationship: string | null;
  contactEmail: string | null;
  /** Populated only if this beneficiary independently is/becomes a platform user — never set via this domain's own writes. */
  linkedUserId: string | null;
  notes: string | null;
  createdAt: string;
}

export interface CreateBeneficiaryInput {
  digitalAssetId: string | null;
  displayName: string;
  relationship: string | null;
  contactEmail: string | null;
  notes: string | null;
}

export interface UpdateBeneficiaryInput {
  digitalAssetId?: string | null;
  displayName?: string;
  relationship?: string | null;
  contactEmail?: string | null;
  notes?: string | null;
}

export interface BeneficiaryRepository {
  createBeneficiary(estateId: string, input: CreateBeneficiaryInput): Promise<Beneficiary>;
  getBeneficiary(beneficiaryId: string): Promise<Beneficiary | null>;
  updateBeneficiary(beneficiaryId: string, input: UpdateBeneficiaryInput): Promise<Beneficiary>;
  deleteBeneficiary(beneficiaryId: string): Promise<void>;
  listBeneficiaries(estateId: string): Promise<Beneficiary[]>;
}
