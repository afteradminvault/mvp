import { NextResponse } from "next/server";
import { EstateNotFoundError, InvalidEstateInputError } from "@/domain/estates/estate-service";

export function estateErrorResponse(error: unknown): NextResponse {
  if (error instanceof InvalidEstateInputError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof EstateNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  console.error(error);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}
