import { NextResponse } from "next/server";
import { EstateNotFoundError } from "@/domain/estates/estate-service";
import { KeyRecoveryForbiddenError, KeyRecoveryNotAvailableError } from "@/domain/key-recovery/key-recovery-service";

export function keyRecoveryErrorResponse(error: unknown): NextResponse {
  if (error instanceof EstateNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof KeyRecoveryNotAvailableError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof KeyRecoveryForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  console.error(error);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}
