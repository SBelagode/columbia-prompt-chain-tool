import { Suspense } from "react";
import { requireSuperadmin } from "@/lib/auth";
import AppHeader from "@/components/AppHeader";
import SignOutButton from "@/components/SignOutButton";

async function Account() {
  const { user } = await requireSuperadmin();

  return (
    <>
      <span className="hidden truncate text-sm text-zinc-600 sm:block dark:text-zinc-400">
        {user.email}
      </span>
      <SignOutButton />
    </>
  );
}

// Every route under /chains renders inside this gate. proxy.ts enforces the
// same check first, and each page and Server Action must call
// requireSuperadmin() again because layouts don't re-run on client navigation.
async function Gate({ children }: { children: React.ReactNode }) {
  await requireSuperadmin();
  return children;
}

export default function ChainsLayout({ children }: LayoutProps<"/chains">) {
  return (
    <>
      <AppHeader>
        <Suspense>
          <Account />
        </Suspense>
      </AppHeader>
      <Suspense fallback={<p className="p-4 text-sm text-zinc-500 dark:text-zinc-400">Checking access…</p>}>
        <Gate>{children}</Gate>
      </Suspense>
    </>
  );
}
