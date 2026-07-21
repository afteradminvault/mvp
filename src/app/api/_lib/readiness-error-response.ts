import { NextResponse } from "next/server";
import { ReadinessForbiddenError } from "@/domain/readiness/readiness-service";

export function readinessErrorResponse(error: unknown): NextResponse {
  if (error instanceof ReadinessForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  console.error(error);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}
