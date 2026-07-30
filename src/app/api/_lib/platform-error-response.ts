import { NextResponse } from "next/server";
import { InvalidPlatformInputError, PlatformNotFoundError } from "@/domain/platforms/platform-service";

export function platformErrorResponse(error: unknown): NextResponse {
  if (error instanceof InvalidPlatformInputError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof PlatformNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  console.error(error);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}
