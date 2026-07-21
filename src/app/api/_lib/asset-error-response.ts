import { NextResponse } from "next/server";
import { AssetNotFoundError, InvalidAssetInputError } from "@/domain/assets/asset-service";

export function assetErrorResponse(error: unknown): NextResponse {
  if (error instanceof InvalidAssetInputError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof AssetNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  console.error(error);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}
