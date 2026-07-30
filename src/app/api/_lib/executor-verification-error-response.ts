import { NextResponse } from "next/server";
import {
  ExecutorVerificationForbiddenError,
  ExecutorVerificationNotFoundError,
  InvalidExecutorVerificationInputError,
} from "@/domain/executor-verification/executor-verification-service";

export function executorVerificationErrorResponse(error: unknown): NextResponse {
  if (error instanceof InvalidExecutorVerificationInputError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof ExecutorVerificationNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof ExecutorVerificationForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  console.error(error);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}
