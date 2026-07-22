import { ASSET_CATEGORIES } from "@/domain/assets/asset-service";
import type { AssetCategory } from "@/domain/assets/ports";
import type {
  AdminProvider,
  AdminProviderRepository,
  CreateProviderInput,
  UpdateProviderInput,
} from "./ports";

export const MAX_NAME_LENGTH = 200;
export const MAX_NOTES_LENGTH = 2000;

export class InvalidProviderInputError extends Error {}
export class ProviderForbiddenError extends Error {}

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

    try {
      return await this.repository.createProvider({ name, defaultCategory, websiteUrl, notes });
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
