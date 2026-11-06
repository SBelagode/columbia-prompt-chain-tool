"use client";

import { useEffect } from "react";
import { secondaryButtonClass } from "@/components/crud/ActionForm";

// Catches unexpected failures under /chains. Details stay in the console.
export default function ChainsError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col items-start gap-3 px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        This page couldn&apos;t be loaded. Please try again.
      </p>
      <button type="button" onClick={() => retry()} className={secondaryButtonClass}>
        Try again
      </button>
    </main>
  );
}
