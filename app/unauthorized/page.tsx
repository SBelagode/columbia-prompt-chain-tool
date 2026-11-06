import AppHeader from "@/components/AppHeader";
import SignOutButton from "@/components/SignOutButton";

export default function UnauthorizedPage() {
  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-24">
        <h1 className="text-2xl font-semibold tracking-tight">Not authorized</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          This tool is only available to superadmins.
        </p>
        <SignOutButton />
      </main>
    </>
  );
}
