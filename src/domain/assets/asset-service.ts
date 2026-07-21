import type {
  AssetCategory,
  CreateDigitalAssetInput,
  DigitalAsset,
  DigitalAssetRepository,
  IntendedOutcome,
  ListDigitalAssetsFilter,
  UpdateDigitalAssetInput,
} from "./ports";

export const ASSET_CATEGORIES: readonly AssetCategory[] = [
  "financial",
  "social",
  "subscription",
  "crypto",
  "cloud_storage",
  "domain",
  "other",
];

export const INTENDED_OUTCOMES: readonly IntendedOutcome[] = [
  "close",
  "transfer",
  "memorialize",
  "ignore",
  "other",
];

export const MAX_CUSTOM_PROVIDER_NAME_LENGTH = 200;
export const MAX_ACCOUNT_IDENTIFIER_LENGTH = 200;
export const MAX_NOTES_LENGTH = 2000;

export class InvalidAssetInputError extends Error {}
export class AssetNotFoundError extends Error {}

function validateCategory(category: unknown): AssetCategory {
  if (typeof category !== "string" || !ASSET_CATEGORIES.includes(category as AssetCategory)) {
    throw new InvalidAssetInputError(`category must be one of: ${ASSET_CATEGORIES.join(", ")}.`);
  }
  return category as AssetCategory;
}

function validateIntendedOutcome(outcome: unknown): IntendedOutcome {
  if (typeof outcome !== "string" || !INTENDED_OUTCOMES.includes(outcome as IntendedOutcome)) {
    throw new InvalidAssetInputError(`intendedOutcome must be one of: ${INTENDED_OUTCOMES.join(", ")}.`);
  }
  return outcome as IntendedOutcome;
}

function validateBoundedText(value: string, fieldName: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new InvalidAssetInputError(`${fieldName} cannot be blank if provided.`);
  }
  if (trimmed.length > maxLength) {
    throw new InvalidAssetInputError(`${fieldName} must be ${maxLength} characters or fewer.`);
  }
  return trimmed;
}

/**
 * Every asset must be identifiable by exactly one of a known provider (from
 * the `providers` reference table) or a free-text custom name — never both
 * (ambiguous) and never neither (an asset with no identifiable provider
 * isn't useful to a future executor). See Database Schema §4.1.
 */
function validateProviderIdentity(
  providerId: string | null | undefined,
  customProviderName: string | null | undefined,
): { providerId: string | null; customProviderName: string | null } {
  const hasProviderId = typeof providerId === "string" && providerId.trim().length > 0;
  const hasCustomName = typeof customProviderName === "string" && customProviderName.trim().length > 0;

  if (hasProviderId && hasCustomName) {
    throw new InvalidAssetInputError("Specify either a provider or a custom provider name, not both.");
  }
  if (!hasProviderId && !hasCustomName) {
    throw new InvalidAssetInputError("Specify a provider or a custom provider name.");
  }
  return {
    providerId: hasProviderId ? (providerId as string).trim() : null,
    customProviderName: hasCustomName
      ? validateBoundedText(customProviderName as string, "customProviderName", MAX_CUSTOM_PROVIDER_NAME_LENGTH)
      : null,
  };
}

/**
 * An amount without a currency is ambiguous and a currency without an
 * amount is pointless — both or neither.
 */
function validateEstimatedValue(
  estimatedValueCents: number | null | undefined,
  currency: string | null | undefined,
): { estimatedValueCents: number | null; currency: string | null } {
  const hasValue = estimatedValueCents !== undefined && estimatedValueCents !== null;
  const hasCurrency = typeof currency === "string" && currency.trim().length > 0;

  if (hasValue !== hasCurrency) {
    throw new InvalidAssetInputError("estimatedValueCents and currency must be provided together, or not at all.");
  }
  if (!hasValue) {
    return { estimatedValueCents: null, currency: null };
  }
  if (!Number.isInteger(estimatedValueCents) || (estimatedValueCents as number) < 0) {
    throw new InvalidAssetInputError("estimatedValueCents must be a non-negative integer.");
  }
  const normalizedCurrency = (currency as string).trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
    throw new InvalidAssetInputError("currency must be a 3-letter ISO 4217 code.");
  }
  return { estimatedValueCents: estimatedValueCents as number, currency: normalizedCurrency };
}

/**
 * Orchestrates digital-asset use cases and owns the validation rules
 * around them, same layering rationale as EstateService — see
 * src/domain/estates/estate-service.ts.
 */
export class AssetService {
  constructor(private readonly repository: DigitalAssetRepository) {}

  async createAsset(estateId: string, input: CreateDigitalAssetInput): Promise<DigitalAsset> {
    const category = validateCategory(input.category);
    const { providerId, customProviderName } = validateProviderIdentity(
      input.providerId,
      input.customProviderName,
    );
    const intendedOutcome =
      input.intendedOutcome === undefined ? undefined : validateIntendedOutcome(input.intendedOutcome);
    const accountIdentifier =
      input.accountIdentifier === undefined || input.accountIdentifier === null
        ? null
        : validateBoundedText(input.accountIdentifier, "accountIdentifier", MAX_ACCOUNT_IDENTIFIER_LENGTH);
    const intendedOutcomeNotes =
      input.intendedOutcomeNotes === undefined || input.intendedOutcomeNotes === null
        ? null
        : validateBoundedText(input.intendedOutcomeNotes, "intendedOutcomeNotes", MAX_NOTES_LENGTH);
    const { estimatedValueCents, currency } = validateEstimatedValue(
      input.estimatedValueCents,
      input.currency,
    );

    return this.repository.createAsset(estateId, {
      category,
      providerId,
      customProviderName,
      accountIdentifier,
      intendedOutcome,
      intendedOutcomeNotes,
      estimatedValueCents,
      currency,
    });
  }

  async getAsset(assetId: string): Promise<DigitalAsset> {
    const asset = await this.repository.getAsset(assetId);
    if (!asset) {
      throw new AssetNotFoundError("Asset not found, or you don't have access to it.");
    }
    return asset;
  }

  async updateAsset(assetId: string, input: UpdateDigitalAssetInput): Promise<DigitalAsset> {
    const existing = await this.getAsset(assetId);
    if (existing.archivedAt) {
      throw new InvalidAssetInputError("Cannot edit an archived asset.");
    }

    const patch: UpdateDigitalAssetInput = {};
    if (input.category !== undefined) {
      patch.category = validateCategory(input.category);
    }
    if (input.providerId !== undefined || input.customProviderName !== undefined) {
      const resolvedProviderId = input.providerId !== undefined ? input.providerId : existing.providerId;
      const resolvedCustomName =
        input.customProviderName !== undefined ? input.customProviderName : existing.customProviderName;
      const { providerId, customProviderName } = validateProviderIdentity(resolvedProviderId, resolvedCustomName);
      patch.providerId = providerId;
      patch.customProviderName = customProviderName;
    }
    if (input.accountIdentifier !== undefined) {
      patch.accountIdentifier =
        input.accountIdentifier === null
          ? null
          : validateBoundedText(input.accountIdentifier, "accountIdentifier", MAX_ACCOUNT_IDENTIFIER_LENGTH);
    }
    if (input.intendedOutcome !== undefined) {
      patch.intendedOutcome = validateIntendedOutcome(input.intendedOutcome);
    }
    if (input.intendedOutcomeNotes !== undefined) {
      patch.intendedOutcomeNotes =
        input.intendedOutcomeNotes === null
          ? null
          : validateBoundedText(input.intendedOutcomeNotes, "intendedOutcomeNotes", MAX_NOTES_LENGTH);
    }
    if (input.estimatedValueCents !== undefined || input.currency !== undefined) {
      const resolvedValue =
        input.estimatedValueCents !== undefined ? input.estimatedValueCents : existing.estimatedValueCents;
      const resolvedCurrency = input.currency !== undefined ? input.currency : existing.currency;
      const { estimatedValueCents, currency } = validateEstimatedValue(resolvedValue, resolvedCurrency);
      patch.estimatedValueCents = estimatedValueCents;
      patch.currency = currency;
    }

    if (Object.keys(patch).length === 0) {
      throw new InvalidAssetInputError("No valid fields to update.");
    }

    return this.repository.updateAsset(assetId, patch);
  }

  async archiveAsset(assetId: string): Promise<DigitalAsset> {
    await this.getAsset(assetId);
    return this.repository.archiveAsset(assetId);
  }

  async listAssets(estateId: string, filter?: ListDigitalAssetsFilter): Promise<DigitalAsset[]> {
    if (filter?.category !== undefined) {
      validateCategory(filter.category);
    }
    return this.repository.listAssets(estateId, filter);
  }
}
