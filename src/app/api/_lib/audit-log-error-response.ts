import { NextResponse } from "next/server";
import { InvalidAuditLogQueryError } from "@/domain/audit-logs/audit-log-service";

export function auditLogErrorResponse(error: unknown): NextResponse {
  if (error instanceof InvalidAuditLogQueryError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  console.error(error);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}
