import { Suspense } from "react";
import Link from "next/link";
import { requireSuperadmin } from "@/lib/auth";
import { logReadError } from "@/lib/crud";
import { DEFAULT_CHAIN_SLUG, MAX_DESCRIPTION, MAX_NAME, MAX_SLUG } from "@/lib/chains";
import { createChain } from "@/app/chains/actions";
import ChainEditor from "@/components/ChainEditor";
import ActionForm from "@/components/crud/ActionForm";
import { TextAreaField, TextField } from "@/components/crud/fields";

type ChainRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  updated_at: string;
  prompt_chain_steps: { count: number }[] | null;
};

async function ChainList() {
  const { supabase } = await requireSuperadmin();

  const { data, error } = await supabase
    .from("prompt_chains")
    .select("id, name, slug, description, updated_at, prompt_chain_steps(count)")
    .order("name");

  if (error) {
    logReadError("chains", error);
    return <p role="alert" className="text-sm text-red-700 dark:text-red-400">Couldn&apos;t load prompt chains.</p>;
  }

  const chains = (data ?? []) as ChainRow[];
  if (chains.length === 0) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">No prompt chains yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {chains.map((chain) => {
        const stepCount = chain.prompt_chain_steps?.[0]?.count ?? 0;
        return (
          <li key={chain.id} className="rounded border border-zinc-200 p-3 dark:border-zinc-800">
            <ChainEditor
              chain={chain}
              view={
                <>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Link href={`/chains/${chain.id}`} className="text-sm font-medium hover:underline">
                      {chain.name}
                    </Link>
                    <span className="text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
                      {stepCount} {stepCount === 1 ? "step" : "steps"} · Updated{" "}
                      {chain.updated_at.slice(0, 10)}
                    </span>
                  </div>
                  <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                    {chain.slug}
                    {chain.slug === DEFAULT_CHAIN_SLUG && " · default"}
                  </p>
                  {chain.description && (
                    <p className="text-sm text-zinc-700 dark:text-zinc-300">{chain.description}</p>
                  )}
                </>
              }
            />
          </li>
        );
      })}
    </ul>
  );
}

export default function ChainsPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Prompt chains</h1>

      <details className="rounded border border-zinc-200 dark:border-zinc-800">
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium">New chain</summary>
        <div className="border-t border-zinc-200 p-3 dark:border-zinc-800">
          <ActionForm action={createChain} submitLabel="Create chain" pendingLabel="Creating…">
            <TextField label="Name" name="name" required maxLength={MAX_NAME} />
            <TextField
              label="Slug (optional)"
              name="slug"
              mono
              maxLength={MAX_SLUG}
              hint="Leave blank to generate it from the name. It can't be changed later."
            />
            <TextAreaField label="Description" name="description" maxLength={MAX_DESCRIPTION} />
          </ActionForm>
        </div>
      </details>

      <Suspense fallback={<p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>}>
        <ChainList />
      </Suspense>
    </main>
  );
}
