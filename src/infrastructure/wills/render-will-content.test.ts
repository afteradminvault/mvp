import { describe, expect, it } from "vitest";
import type { WillExecutionRequirement } from "@/domain/admin-will-execution-requirements/ports";
import type { WillBequest, WillExecutorSummary } from "@/domain/wills/ports";
import { renderWillContent } from "./render-will-content";

function makeExecutionRequirement(overrides: Partial<WillExecutionRequirement> = {}): WillExecutionRequirement {
  return {
    id: "req-1",
    jurisdictionId: "jurisdiction-1",
    witnessCount: 2,
    notarizationRequired: false,
    selfProvingAffidavitAvailable: false,
    holographicWillsAllowed: false,
    executionInstructions: "Sign in front of two witnesses; store the original.",
    effectiveDate: "2026-08-05",
    supersededById: null,
    notes: null,
    pendingCounselReview: true,
    createdAt: "2026-08-05T00:00:00.000Z",
    updatedAt: "2026-08-05T00:00:00.000Z",
    ...overrides,
  };
}

function makeBequest(overrides: Partial<WillBequest> = {}): WillBequest {
  return {
    id: "bequest-1",
    willId: "will-1",
    bequestCategory: "digital_asset",
    digitalAssetId: null,
    beneficiaryId: null,
    description: "My coin collection",
    displayOrder: 0,
    createdAt: "2026-08-05T00:00:00.000Z",
    updatedAt: "2026-08-05T00:00:00.000Z",
    ...overrides,
  };
}

function baseInput(overrides: Partial<Parameters<typeof renderWillContent>[0]> = {}) {
  return {
    testatorFullName: "Marcus Whitfield",
    testatorDateOfBirth: "1980-05-01",
    caseDisplayName: "Marcus Whitfield's Case",
    executors: [] as WillExecutorSummary[],
    hasMinorChildren: false,
    guardianFullName: null,
    guardianRelationship: null,
    alternateGuardianFullName: null,
    alternateGuardianRelationship: null,
    bequests: [] as { bequest: WillBequest; linkedDisplayText: string | null }[],
    residuaryBeneficiaryDescription: "everything else to my spouse",
    executionRequirement: makeExecutionRequirement(),
    ...overrides,
  };
}

describe("renderWillContent", () => {
  it("includes testator identification and a revocation-of-prior-wills clause", () => {
    const content = renderWillContent(baseInput());

    expect(content).toContain("Marcus Whitfield");
    expect(content).toMatch(/revoke all prior wills/i);
  });

  it("nominates the primary executor and, when present, an alternate in fallback order", () => {
    const content = renderWillContent(
      baseInput({
        executors: [
          { displayName: "Jane Doe", inviteEmail: "jane@example.com", fallbackOrder: null },
          { displayName: null, inviteEmail: "backup@example.com", fallbackOrder: 1 },
        ],
      }),
    );

    expect(content).toContain("I nominate Jane Doe to serve as the Executor");
    expect(content).toContain("nominate backup@example.com to serve as Executor in their place");
  });

  it("flags when no executor has been nominated yet", () => {
    const content = renderWillContent(baseInput({ executors: [] }));

    expect(content).toMatch(/have not yet nominated an Executor/i);
  });

  it("includes the guardian section only when hasMinorChildren is true", () => {
    const withoutChildren = renderWillContent(baseInput({ hasMinorChildren: false }));
    expect(withoutChildren).not.toContain("GUARDIAN FOR MINOR CHILDREN");

    const withChildren = renderWillContent(
      baseInput({
        hasMinorChildren: true,
        guardianFullName: "Aunt Sarah",
        guardianRelationship: "sister",
      }),
    );
    expect(withChildren).toContain("GUARDIAN FOR MINOR CHILDREN");
    expect(withChildren).toContain("Aunt Sarah");
  });

  it("groups bequests by category and prefers the linked display text over free-text description", () => {
    const content = renderWillContent(
      baseInput({
        bequests: [
          { bequest: makeBequest({ bequestCategory: "digital_asset", description: "fallback text" }), linkedDisplayText: "Coinbase Account" },
          { bequest: makeBequest({ bequestCategory: "vehicle", description: "My 2020 Honda Civic" }), linkedDisplayText: null },
        ],
      }),
    );

    expect(content).toContain("Digital Assets:");
    expect(content).toContain("Coinbase Account");
    expect(content).not.toContain("fallback text");
    expect(content).toContain("Vehicles:");
    expect(content).toContain("My 2020 Honda Civic");
  });

  it("surfaces the beneficiary-designated-accounts note whenever there are bequests", () => {
    const content = renderWillContent(
      baseInput({ bequests: [{ bequest: makeBequest(), linkedDisplayText: null }] }),
    );

    expect(content).toMatch(/life insurance/i);
    expect(content).toMatch(/retirement account/i);
    expect(content).toMatch(/outside of this Will/i);
  });

  it("includes the residuary clause", () => {
    const content = renderWillContent(baseInput({ residuaryBeneficiaryDescription: "everything else to my spouse" }));

    expect(content).toContain("RESIDUARY ESTATE");
    expect(content).toContain("everything else to my spouse");
  });

  it("includes the jurisdiction's execution requirements, witness count, and optional flags", () => {
    const content = renderWillContent(
      baseInput({
        executionRequirement: makeExecutionRequirement({
          witnessCount: 3,
          notarizationRequired: true,
          selfProvingAffidavitAvailable: true,
          holographicWillsAllowed: true,
        }),
      }),
    );

    expect(content).toContain("Witnesses required: 3");
    expect(content).toContain("Notarization is required");
    expect(content).toContain("self-proving affidavit");
    expect(content).toContain("holographic");
  });

  it("always includes the not-a-valid-will-until-executed disclaimer", () => {
    const content = renderWillContent(baseInput());

    expect(content).toMatch(/NOT a valid, legally binding will/);
  });
});
