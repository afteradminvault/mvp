import { NextResponse } from "next/server";
import {
  InvalidNotificationLetterInputError,
  NotificationLetterAlreadyFinalizedError,
  NotificationLetterForbiddenError,
  NotificationLetterNotFoundError,
} from "@/domain/notification-letters/notification-letter-service";

export function notificationLetterErrorResponse(error: unknown): NextResponse {
  if (error instanceof InvalidNotificationLetterInputError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof NotificationLetterNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof NotificationLetterAlreadyFinalizedError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof NotificationLetterForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  console.error(error);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}
