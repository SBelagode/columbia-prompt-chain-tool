import { createBrowserClient } from "@supabase/ssr";

// Browser client for Client Components. Uses only the public anon key;
// the session lives in cookies so the server can read it too.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
