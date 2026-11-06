import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Google Identity Services (redirect mode) POSTs here with form fields
// "credential" (the Google ID token) and "g_csrf_token".
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const credential = formData.get("credential");
  const csrfTokenBody = formData.get("g_csrf_token");
  const csrfTokenCookie = request.cookies.get("g_csrf_token")?.value;

  if (typeof credential !== "string" || !credential) {
    return new NextResponse("Missing credential", { status: 400 });
  }

  // GIS sends g_csrf_token in both the POST body and a cookie; they must match.
  if (
    typeof csrfTokenBody !== "string" ||
    !csrfTokenCookie ||
    csrfTokenBody !== csrfTokenCookie
  ) {
    return new NextResponse("CSRF verification failed", { status: 400 });
  }

  // 303 so the browser follows with a GET. Session cookies are written onto it.
  const response = NextResponse.redirect(new URL("/chains", request.url), {
    status: 303,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers ?? {}).forEach(([key, value]) =>
            response.headers.set(key, value),
          );
        },
      },
    },
  );

  const { error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: credential,
  });

  if (error) {
    console.error(
      "[auth/callback] signInWithIdToken failed:",
      error.status,
      error.message,
    );
    return NextResponse.redirect(new URL("/?error=auth_failed", request.url), {
      status: 303,
    });
  }

  return response;
}
