import { NextResponse } from "next/server";
import {
  DeathVerificationForbiddenError,
  DeathVerificationInvalidStateError,
} from "@/domain/death-verification/death-verification-service";

export function deathVerificationErrorResponse(error: unknown): NextResponse {
  if (error instanceof DeathVerificationForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof DeathVerificationInvalidStateError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  console.error(error);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}
