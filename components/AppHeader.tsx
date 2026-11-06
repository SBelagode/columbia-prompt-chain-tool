import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";

// Top navigation for every page. `children` holds page-specific controls.
export default function AppHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <nav
        aria-label="Main"
        className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3"
      >
        <Link href="/" className="text-sm font-semibold">
          Prompt Chain Tool
        </Link>
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          {children}
          <ThemeToggle />
        </div>
      </nav>
    </header>
  );
}
