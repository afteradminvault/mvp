import { ASSET_CATEGORIES } from "@/domain/assets/asset-service";
import type { AssetCategory } from "@/domain/assets/ports";
import type {
  AdminProvider,
  AdminProviderRepository,
  ClosureMethod,
  CreateProviderInput,
  UpdateProviderInput,
} from "./ports";

export const MAX_NAME_LENGTH = 200;
export const MAX_NOTES_LENGTH = 2000;
export const MAX_CLOSURE_INSTRUCTIONS_LENGTH = 4000;
export const CLOSURE_METHODS: readonly ClosureMethod[] = ["online_form", "email", "phone", "automatic"];

export class InvalidProviderInputError extends Error {}
export class ProviderForbiddenError extends Error {}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateClosureMethod(value: unknown): ClosureMethod | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !CLOSURE_METHODS.includes(value as ClosureMethod)) {
    throw new InvalidProviderInputError(`closureMethod must be one of: ${CLOSURE_METHODS.join(", ")}.`);
  }
  return value as ClosureMethod;
}

function validateOptionalUrl(value: unknown, fieldName: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new InvalidProviderInputError(`${fieldName} must be a string.`);
  }
  try {
    new URL(value);
  } catch {
    throw new InvalidProviderInputError(`${fieldName} must be a valid URL.`);
  }
  return value;
}

function validateOptionalEmail(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !EMAIL_PATTERN.test(value.trim())) {
    throw new InvalidProviderInputError("bereavementContactEmail must be a valid email address.");
  }
  return value.trim();
}

function validateOptionalPhone(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidProviderInputError("bereavementContactPhone must be a non-empty string.");
  }
  return value.trim();
}

function validateName(name: unknown): string {
  if (typeof name !== "string" || name.trim().length === 0) {
    throw new InvalidProviderInputError("name is required.");
  }
  const trimmed = name.trim();
  if (trimmed.length > MAX_NAME_LENGTH) {
    throw new InvalidProviderInputError(`name must be ${MAX_NAME_LENGTH} characters or fewer.`);
  }
  return trimmed;
}

function validateCategory(category: unknown): AssetCategory {
  if (typeof category !== "string" || !ASSET_CATEGORIES.includes(category as AssetCategory)) {
    throw new InvalidProviderInputError(`defaultCategory must be one of: ${ASSET_CATEGORIES.join(", ")}.`);
  }
  return category as AssetCategory;
}

function validateWebsiteUrl(websiteUrl: unknown): string | null {
  if (websiteUrl === undefined || websiteUrl === null || websiteUrl === "") return null;
  if (typeof websiteUrl !== "string") {
    throw new InvalidProviderInputError("websiteUrl must be a string.");
  }
  try {
    new URL(websiteUrl);
  } catch {
    throw new InvalidProviderInputError("websiteUrl must be a valid URL.");
  }
  return websiteUrl;
}

function validateNotes(notes: unknown): string | null {
  if (notes === undefined || notes === null || notes === "") return null;
  if (typeof notes !== "string") {
    throw new InvalidProviderInputError("notes must be a string.");
  }
  if (notes.length > MAX_NOTES_LENGTH) {
    throw new InvalidProviderInputError(`notes must be ${MAX_NOTES_LENGTH} characters or fewer.`);
  }
  return notes;
}

function validateClosureInstructions(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new InvalidProviderInputError("closureInstructions must be a string.");
  }
  if (value.length > MAX_CLOSURE_INSTRUCTIONS_LENGTH) {
    throw new InvalidProviderInputError(`closureInstructions must be ${MAX_CLOSURE_INSTRUCTIONS_LENGTH} characters or fewer.`);
  }
  return value;
}

function translateRepositoryError(error: unknown): never {
  // Real Postgres RLS WITH CHECK violation text (providers_admin_write) —
  // defense-in-depth fallback; requirePlatformAdmin() at the route layer
  // is the primary gate.
  if (error instanceof Error && /row-level security|permission denied/i.test(error.message)) {
    throw new ProviderForbiddenError("Only platform admins can manage providers.");
  }
  throw error;
}

/**
 * No delete: legal_requirements.provider_id cascades on provider delete
 * (Database Schema §3.2), which would silently destroy checklist history
 * — not offered here.
 */
export class AdminProviderService {
  constructor(private readonly repository: AdminProviderRepository) {}

  async createProvider(input: CreateProviderInput): Promise<AdminProvider> {
    const name = validateName(input.name);
    const defaultCategory = validateCategory(input.defaultCategory);
    const websiteUrl = validateWebsiteUrl(input.websiteUrl);
    const notes = validateNotes(input.notes);
    const closureMethod = validateClosureMethod(input.closureMethod);
    const closureInstructions = validateClosureInstructions(input.closureInstructions);
    const bereavementContactEmail = validateOptionalEmail(input.bereavementContactEmail);
    const bereavementContactPhone = validateOptionalPhone(input.bereavementContactPhone);
    const bereavementInstructionsUrl = validateOptionalUrl(
      input.bereavementInstructionsUrl,
      "bereavementInstructionsUrl",
    );
    const logoUrl = validateOptionalUrl(input.logoUrl, "logoUrl");
    const isCommonOnboardingPlatform = input.isCommonOnboardingPlatform ?? false;
    const supportsMemorialize = input.supportsMemorialize ?? false;
    const isActive = input.isActive ?? true;

    try {
      return await this.repository.createProvider({
        name,
        defaultCategory,
        websiteUrl,
        notes,
        closureMethod,
        closureInstructions,
        bereavementContactEmail,
        bereavementContactPhone,
        bereavementInstructionsUrl,
        logoUrl,
        isCommonOnboardingPlatform,
        supportsMemorialize,
        isActive,
      });
    } catch (error) {
      translateRepositoryError(error);
    }
  }

  async listProviders(): Promise<AdminProvider[]> {
    try {
      return await this.repository.listProviders();
    } catch (error) {
      translateRepositoryError(error);
    }
  }

  async updateProvider(id: string, input: UpdateProviderInput): Promise<AdminProvider> {
    const patch: UpdateProviderInput = {};
    if (input.name !== undefined) patch.name = validateName(input.name);
    if (input.defaultCategory !== undefined) patch.defaultCategory = validateCategory(input.defaultCategory);
    if (input.websiteUrl !== undefined) patch.websiteUrl = validateWebsiteUrl(input.websiteUrl);
    if (input.notes !== undefined) patch.notes = validateNotes(input.notes);
    if (input.closureMethod !== undefined) patch.closureMethod = validateClosureMethod(input.closureMethod);
    if (input.closureInstructions !== undefined)
      patch.closureInstructions = validateClosureInstructions(input.closureInstructions);
    if (input.bereavementContactEmail !== undefined)
      patch.bereavementContactEmail = validateOptionalEmail(input.bereavementContactEmail);
    if (input.bereavementContactPhone !== undefined)
      patch.bereavementContactPhone = validateOptionalPhone(input.bereavementContactPhone);
    if (input.bereavementInstructionsUrl !== undefined)
      patch.bereavementInstructionsUrl = validateOptionalUrl(
        input.bereavementInstructionsUrl,
        "bereavementInstructionsUrl",
      );
    if (input.logoUrl !== undefined) patch.logoUrl = validateOptionalUrl(input.logoUrl, "logoUrl");
    if (input.isCommonOnboardingPlatform !== undefined)
      patch.isCommonOnboardingPlatform = input.isCommonOnboardingPlatform;
    if (input.supportsMemorialize !== undefined) patch.supportsMemorialize = input.supportsMemorialize;
    if (input.isActive !== undefined) patch.isActive = input.isActive;
    if (Object.keys(patch).length === 0) {
      throw new InvalidProviderInputError("No valid fields to update.");
    }

    try {
      return await this.repository.updateProvider(id, patch);
    } catch (error) {
      translateRepositoryError(error);
    }
  }
}
