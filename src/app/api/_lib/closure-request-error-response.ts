import { NextResponse } from "next/server";
import {
  ClosureRequestForbiddenError,
  ClosureRequestNotFoundError,
  InvalidClosureRequestInputError,
} from "@/domain/closure-requests/closure-request-service";

export function closureRequestErrorResponse(error: unknown): NextResponse {
  if (error instanceof InvalidClosureRequestInputError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof ClosureRequestNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof ClosureRequestForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  console.error(error);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}
