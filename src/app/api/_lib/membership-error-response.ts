import { NextResponse } from "next/server";
import {
  InvalidMembershipInputError,
  InviteInvalidOrExpiredError,
  MembershipForbiddenError,
  MembershipNotFoundError,
} from "@/domain/membership/membership-service";

export function membershipErrorResponse(error: unknown): NextResponse {
  if (error instanceof InvalidMembershipInputError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof InviteInvalidOrExpiredError) {
    return NextResponse.json({ error: error.message }, { status: 410 });
  }
  if (error instanceof MembershipForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof MembershipNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  console.error(error);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}
