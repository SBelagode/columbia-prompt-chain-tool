import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { io } from "next/cache";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export type SuperadminStatus =
  | { status: "unauthenticated" }
  | { status: "forbidden"; user: User }
  | { status: "authorized"; user: User };

// Single source of truth for app access. Uses getUser(), which validates
// the session with Supabase Auth, then reads is_superadmin from the database
// under the user's own JWT. Never trusts client-provided state. Fails closed.
export async function getSuperadminStatus(
  supabase: SupabaseClient,
): Promise<SuperadminStatus> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "unauthenticated" };

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("is_superadmin")
    .eq("id", user.id)
    .maybeSingle();

  if (error || profile?.is_superadmin !== true) {
    return { status: "forbidden", user };
  }
  return { status: "authorized", user };
}

// For Server Components, Server Actions and Route Handlers. Call it in every
// protected page and mutation, not just the layout. Deduplicated per request.
export const requireSuperadmin = cache(async () => {
  // With Partial Prefetching, cookies() can resolve during prerendering, and
  // Supabase reads Date.now() to check session expiry. That happens as soon as
  // the client is created (createServerClient subscribes to onAuthStateChange,
  // which loads the session), so io() must come before createClient(). It
  // keeps everything after it out of the prerender and resolves immediately
  // on real requests.
  await io();
  const supabase = await createClient();
  const result = await getSuperadminStatus(supabase);

  if (result.status === "unauthenticated") redirect("/");
  if (result.status === "forbidden") redirect("/unauthorized");

  return { supabase, user: result.user };
});
