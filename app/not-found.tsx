import Link from "next/link";

// Replaces the default 404, whose built-in styles ignore the chosen theme.
export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-24">
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <Link href="/" className="text-sm underline">
        Back to the tool
      </Link>
    </main>
  );
}
