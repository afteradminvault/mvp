import { NextResponse } from "next/server";
import {
  BeneficiaryForbiddenError,
  BeneficiaryNotFoundError,
  InvalidBeneficiaryInputError,
} from "@/domain/beneficiaries/beneficiary-service";

export function beneficiaryErrorResponse(error: unknown): NextResponse {
  if (error instanceof InvalidBeneficiaryInputError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof BeneficiaryNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof BeneficiaryForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  console.error(error);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}
