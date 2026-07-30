import { NextResponse } from "next/server";
import { VaultPreviewLetterNotFoundError } from "@/domain/vault-preview-letters/vault-preview-letter-service";

export function vaultPreviewLetterErrorResponse(error: unknown): NextResponse {
  if (error instanceof VaultPreviewLetterNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  console.error(error);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}
