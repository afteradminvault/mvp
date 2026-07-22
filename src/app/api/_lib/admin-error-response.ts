import { NextResponse } from "next/server";
import { InvalidJurisdictionInputError, JurisdictionForbiddenError } from "@/domain/admin-jurisdictions/admin-jurisdiction-service";
import { InvalidProviderInputError, ProviderForbiddenError } from "@/domain/admin-providers/admin-provider-service";
import {
  InvalidLegalRequirementInputError,
  LegalRequirementAlreadySupersededError,
  LegalRequirementForbiddenError,
  LegalRequirementNotFoundError,
} from "@/domain/admin-legal-requirements/admin-legal-requirement-service";

export function adminErrorResponse(error: unknown): NextResponse {
  if (
    error instanceof InvalidJurisdictionInputError ||
    error instanceof InvalidProviderInputError ||
    error instanceof InvalidLegalRequirementInputError
  ) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof LegalRequirementNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof LegalRequirementAlreadySupersededError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (
    error instanceof JurisdictionForbiddenError ||
    error instanceof ProviderForbiddenError ||
    error instanceof LegalRequirementForbiddenError
  ) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  console.error(error);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}
