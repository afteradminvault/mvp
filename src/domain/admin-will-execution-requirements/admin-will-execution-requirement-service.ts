import type {
  ListWillExecutionRequirementsFilter,
  WillExecutionRequirement,
  WillExecutionRequirementContentInput,
  WillExecutionRequirementRepository,
} from "./ports";

export const MAX_EXECUTION_INSTRUCTIONS_LENGTH = 4000;
export const MAX_NOTES_LENGTH = 2000;
export const DEFAULT_WITNESS_COUNT = 2;

export class InvalidWillExecutionRequirementInputError extends Error {}
export class WillExecutionRequirementForbiddenError extends Error {}
export class WillExecutionRequirementNotFoundError extends Error {}
export class WillExecutionRequirementAlreadySupersededError extends Error {}

function validateId(id: unknown, fieldName: string): string {
  if (typeof id !== "string" || id.trim().length === 0) {
    throw new InvalidWillExecutionRequirementInputError(`${fieldName} is required.`);
  }
  return id;
}

function validateWitnessCount(value: unknown): number {
  if (value === undefined) return DEFAULT_WITNESS_COUNT;
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new InvalidWillExecutionRequirementInputError("witnessCount must be a non-negative integer.");
  }
  return value as number;
}

function validateExecutionInstructions(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidWillExecutionRequirementInputError("executionInstructions is required.");
  }
  if (value.length > MAX_EXECUTION_INSTRUCTIONS_LENGTH) {
    throw new InvalidWillExecutionRequirementInputError(
      `executionInstructions must be ${MAX_EXECUTION_INSTRUCTIONS_LENGTH} characters or fewer.`,
    );
  }
  return value;
}

function validateOptionalText(value: unknown, fieldName: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new InvalidWillExecutionRequirementInputError(`${fieldName} must be a string.`);
  }
  if (value.length > MAX_NOTES_LENGTH) {
    throw new InvalidWillExecutionRequirementInputError(`${fieldName} must be ${MAX_NOTES_LENGTH} characters or fewer.`);
  }
  return value;
}

function validateContent(input: WillExecutionRequirementContentInput): WillExecutionRequirementContentInput {
  return {
    jurisdictionId: validateId(input.jurisdictionId, "jurisdictionId"),
    witnessCount: validateWitnessCount(input.witnessCount),
    notarizationRequired: input.notarizationRequired ?? false,
    selfProvingAffidavitAvailable: input.selfProvingAffidavitAvailable ?? false,
    holographicWillsAllowed: input.holographicWillsAllowed ?? false,
    executionInstructions: validateExecutionInstructions(input.executionInstructions),
    notes: validateOptionalText(input.notes, "notes"),
    // Defaults to true, opposite of legal_requirements — see the migration's own comment: unreviewed
    // will-execution content is a materially higher-stakes default than unreviewed closure instructions.
    pendingCounselReview: input.pendingCounselReview ?? true,
  };
}

function translateRepositoryError(error: unknown): never {
  if (error instanceof Error && /row-level security|permission denied/i.test(error.message)) {
    throw new WillExecutionRequirementForbiddenError("Only platform admins can manage will execution requirements.");
  }
  throw error;
}

/**
 * Orchestrates the will_execution_requirements content model — the
 * jurisdiction-as-data pattern reused wholesale from
 * AdminLegalRequirementService (src/domain/admin-legal-requirements/
 * admin-legal-requirement-service.ts). Edits never mutate an existing
 * row's content — reviseRequirement always creates a new row and links
 * the old one to it via supersededById.
 */
export class AdminWillExecutionRequirementService {
  constructor(private readonly repository: WillExecutionRequirementRepository) {}

  async createRequirement(input: WillExecutionRequirementContentInput): Promise<WillExecutionRequirement> {
    const validated = validateContent(input);
    try {
      return await this.repository.createRequirement(validated);
    } catch (error) {
      translateRepositoryError(error);
    }
  }

  async listRequirements(filter?: ListWillExecutionRequirementsFilter): Promise<WillExecutionRequirement[]> {
    try {
      return await this.repository.listRequirements(filter);
    } catch (error) {
      translateRepositoryError(error);
    }
  }

  async reviseRequirement(
    existingId: string,
    input: WillExecutionRequirementContentInput,
  ): Promise<WillExecutionRequirement> {
    const validated = validateContent(input);

    let existing;
    try {
      existing = await this.repository.getRequirement(existingId);
    } catch (error) {
      translateRepositoryError(error);
    }
    if (!existing) {
      throw new WillExecutionRequirementNotFoundError("Will execution requirement not found.");
    }
    if (existing.supersededById) {
      throw new WillExecutionRequirementAlreadySupersededError(
        "This version has already been superseded — revise the current version instead.",
      );
    }

    try {
      return await this.repository.reviseRequirement(existingId, validated);
    } catch (error) {
      translateRepositoryError(error);
    }
  }
}
