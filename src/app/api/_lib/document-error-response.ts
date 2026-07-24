import { NextResponse } from "next/server";
import {
  DocumentAttachedError,
  DocumentForbiddenError,
  DocumentNotFoundError,
  InvalidDocumentInputError,
} from "@/domain/documents/document-service";

export function documentErrorResponse(error: unknown): NextResponse {
  if (error instanceof InvalidDocumentInputError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof DocumentNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof DocumentAttachedError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof DocumentForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  console.error(error);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}
