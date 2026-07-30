import { NextResponse } from "next/server";
import {
  InvalidWillInputError,
  WillAlreadyFinalizedError,
  WillForbiddenError,
  WillNotFoundError,
} from "@/domain/wills/will-service";

export function willErrorResponse(error: unknown): NextResponse {
  if (error instanceof InvalidWillInputError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof WillNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof WillAlreadyFinalizedError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof WillForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  console.error(error);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}
