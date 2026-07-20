import { NextResponse } from "next/server";
import { EstateService } from "@/domain/estates/estate-service";
import { SupabaseEstateRepository } from "@/infrastructure/estates/supabase-estate-repository";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server-client";

/**
 * Public per docs/API_SPECIFICATION.md §8 — jurisdictions_select_all RLS
 * policy allows anonymous reads, so this needs no session check.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const service = new EstateService(new SupabaseEstateRepository(supabase));
  try {
    const jurisdictions = await service.listSupportedJurisdictions();
    return NextResponse.json({ jurisdictions });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
