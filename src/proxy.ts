import { NextRequest } from "next/server";
import { updateSession } from "@/infrastructure/supabase/session-refresh";
import { resolveBrandId, BRAND_OVERRIDE_COOKIE } from "@/config/resolve-brand";
import { BRAND_HEADER } from "@/config/get-brand-config";
import { isBrandId } from "@/config/brand-config";

/**
 * Two-Brand Foundation (Roadmap Addendum, Milestone 0 addition). Next.js
 * only supports one proxy.ts per project, so brand resolution is folded
 * into the existing session-refresh proxy rather than added as a second
 * file. The brand is stamped onto the *request* headers (not just the
 * response) — that's what makes it visible to headers() in downstream
 * Server Components via getBrandConfig(), since a rewritten request's
 * headers are what Next.js actually uses to service the page, not the
 * proxy's own response headers.
 */
export async function proxy(request: NextRequest) {
  const brandId = resolveBrandId(request);

  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.set(BRAND_HEADER, brandId);
  const brandedRequest = new NextRequest(request, { headers: forwardedHeaders });

  const response = await updateSession(brandedRequest);
  // Also surface it as a response header — purely a debugging aid (visible
  // via curl -I / devtools), not what makes it available server-side.
  response.headers.set(BRAND_HEADER, brandId);

  // Local-dev convenience only (real brand domains never hit this branch,
  // since resolveBrandId matches their hostname first): persist a ?brand=
  // override into a cookie so navigating away from the query string doesn't
  // silently fall back to the default brand mid-session.
  const queryOverride = request.nextUrl.searchParams.get("brand");
  if (isBrandId(queryOverride)) {
    response.cookies.set(BRAND_OVERRIDE_COOKIE, queryOverride, { path: "/" });
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static assets and image optimization
     * files, which never carry auth-relevant state.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
