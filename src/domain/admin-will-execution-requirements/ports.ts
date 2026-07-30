/**
 * Admin will-execution-requirements domain contracts (witnesses,
 * notarization, self-proving affidavits, holographic wills — the single
 * most state-variable part of a will). Near-exact mirror of
 * src/domain/admin-legal-requirements/ports.ts. Framework-free, same
 * rationale as the other ports.ts files.
 */
export interface WillExecutionRequirement {
  id: string;
  jurisdictionId: string;
  witnessCount: number;
  notarizationRequired: boolean;
  selfProvingAffidavitAvailable: boolean;
  holographicWillsAllowed: boolean;
  executionInstructions: string;
  effectiveDate: string;
  supersededById: string | null;
  notes: string | null;
  pendingCounselReview: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WillExecutionRequirementContentInput {
  jurisdictionId: string;
  witnessCount?: number;
  notarizationRequired?: boolean;
  selfProvingAffidavitAvailable?: boolean;
  holographicWillsAllowed?: boolean;
  executionInstructions: string;
  notes?: string | null;
  pendingCounselReview?: boolean;
}

export interface ListWillExecutionRequirementsFilter {
  jurisdictionId?: string;
  includeSuperseded?: boolean;
}

export interface WillExecutionRequirementRepository {
  createRequirement(input: WillExecutionRequirementContentInput): Promise<WillExecutionRequirement>;
  listRequirements(filter?: ListWillExecutionRequirementsFilter): Promise<WillExecutionRequirement[]>;
  getRequirement(id: string): Promise<WillExecutionRequirement | null>;
  /** Inserts a new row with `input`, then sets the existing row's superseded_by_id to it — never an in-place UPDATE of content columns. */
  reviseRequirement(existingId: string, input: WillExecutionRequirementContentInput): Promise<WillExecutionRequirement>;
}
