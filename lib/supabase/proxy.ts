import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSuperadminStatus, type SuperadminStatus } from "@/lib/auth";

const SIGN_IN_PATH = "/";
const UNAUTHORIZED_PATH = "/unauthorized";
const HOME_PATH = "/chains";

// Where each kind of visitor belongs. null means let the request through.
// Deny by default: every route not named here requires a superadmin, so new
// routes are protected without having to remember to add them.
function redirectTarget(status: SuperadminStatus["status"], pathname: string): string | null {
  switch (status) {
    case "unauthenticated":
      return pathname === SIGN_IN_PATH ? null : SIGN_IN_PATH;
    case "forbidden":
      return pathname === UNAUTHORIZED_PATH ? null : UNAUTHORIZED_PATH;
    case "authorized":
      return pathname === SIGN_IN_PATH || pathname === UNAUTHORIZED_PATH ? HOME_PATH : null;
  }
}

// Refreshes the Supabase session and writes updated auth cookies to both
// the forwarded request and the outgoing response. Also routes each visitor
// by their access level.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  let authHeaders: Record<string, string> = {};

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          // Cache-Control headers so CDNs never cache a response carrying a session.
          authHeaders = headers ?? {};
          Object.entries(authHeaders).forEach(([key, value]) =>
            response.headers.set(key, value),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and the auth call below;
  // it triggers the token refresh.
  // The callback must stay reachable: it's where a session gets created.
  if (request.nextUrl.pathname === "/auth/callback") {
    await supabase.auth.getClaims();
    return response;
  }

  const { status } = await getSuperadminStatus(supabase);
  const target = redirectTarget(status, request.nextUrl.pathname);
  if (!target) return response;

  const redirect = NextResponse.redirect(new URL(target, request.url));
  // Carry over any refreshed (or cleared) session cookies.
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  Object.entries(authHeaders).forEach(([key, value]) =>
    redirect.headers.set(key, value),
  );
  return redirect;
}
