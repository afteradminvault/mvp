import { NextResponse } from "next/server";
import { InvalidJurisdictionInputError, JurisdictionForbiddenError } from "@/domain/admin-jurisdictions/admin-jurisdiction-service";
import { InvalidProviderInputError, ProviderForbiddenError } from "@/domain/admin-providers/admin-provider-service";
import {
  InvalidLegalRequirementInputError,
  LegalRequirementAlreadySupersededError,
  LegalRequirementForbiddenError,
  LegalRequirementNotFoundError,
} from "@/domain/admin-legal-requirements/admin-legal-requirement-service";
import { AdminUserNotFoundError, InvalidAdminUserInputError } from "@/domain/admin-users/admin-user-service";
import { InvalidAdminCaseInputError } from "@/domain/admin-cases/admin-case-service";
import { InvalidSupportTicketInputError } from "@/domain/admin-support-tickets/admin-support-ticket-service";
import { InvalidAuditLogQueryError } from "@/domain/audit-logs/audit-log-service";

export function adminErrorResponse(error: unknown): NextResponse {
  if (
    error instanceof InvalidJurisdictionInputError ||
    error instanceof InvalidProviderInputError ||
    error instanceof InvalidLegalRequirementInputError ||
    error instanceof InvalidAdminUserInputError ||
    error instanceof InvalidAdminCaseInputError ||
    error instanceof InvalidSupportTicketInputError ||
    error instanceof InvalidAuditLogQueryError
  ) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (
    error instanceof LegalRequirementNotFoundError ||
    error instanceof AdminUserNotFoundError
  ) {
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
