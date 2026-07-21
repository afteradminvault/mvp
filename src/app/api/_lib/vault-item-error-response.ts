import { NextResponse } from "next/server";
import { InvalidVaultItemInputError, VaultItemNotFoundError } from "@/domain/vault-items/vault-item-service";

export function vaultItemErrorResponse(error: unknown): NextResponse {
  if (error instanceof InvalidVaultItemInputError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof VaultItemNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  console.error(error);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}
