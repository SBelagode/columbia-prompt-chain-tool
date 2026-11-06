import { Suspense } from "react";
import AppHeader from "@/components/AppHeader";
import SignInWithGoogle from "@/components/SignInWithGoogle";

// /auth/callback redirects here with ?error=auth_failed when sign-in fails.
async function SignInError({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const { error } = await searchParams;
  if (error !== "auth_failed") return null;
  return (
    <p role="alert" className="text-sm text-red-700 dark:text-red-400">
      Sign-in failed. Please try again.
    </p>
  );
}

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-24">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Sign in with your Google account to continue.
        </p>
        <Suspense>
          <SignInError searchParams={searchParams} />
        </Suspense>
        <SignInWithGoogle />
      </main>
    </>
  );
}
