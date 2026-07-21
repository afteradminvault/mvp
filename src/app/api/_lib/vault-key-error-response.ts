import { NextResponse } from "next/server";
import {
  InvalidVaultKeyInputError,
  VaultKeyAlreadyInitializedError,
  VaultKeyForbiddenError,
} from "@/domain/vault-key/vault-key-service";

export function vaultKeyErrorResponse(error: unknown): NextResponse {
  if (error instanceof InvalidVaultKeyInputError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof VaultKeyAlreadyInitializedError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof VaultKeyForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  console.error(error);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}
