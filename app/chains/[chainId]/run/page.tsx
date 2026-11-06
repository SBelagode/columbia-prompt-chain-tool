import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperadmin } from "@/lib/auth";
import { logReadError } from "@/lib/crud";
import { isUuid } from "@/lib/forms";
import ChainFlow from "@/components/ChainFlow";
import RunForm from "@/components/RunForm";

type ChainRow = {
  id: string;
  name: string;
  prompt_chain_steps: { id: string; name: string }[] | null;
};

async function RunContent({ params }: { params: PageProps<"/chains/[chainId]/run">["params"] }) {
  const { supabase } = await requireSuperadmin();
  const { chainId } = await params;
  if (!isUuid(chainId)) notFound();

  const { data, error } = await supabase
    .from("prompt_chains")
    .select("id, name, prompt_chain_steps(id, name, step_order)")
    .eq("id", chainId)
    .order("step_order", { referencedTable: "prompt_chain_steps" })
    .maybeSingle();

  if (error) {
    logReadError("run", error);
    return <p role="alert" className="text-sm text-red-700 dark:text-red-400">Couldn&apos;t load this chain.</p>;
  }
  if (!data) notFound();

  const chain = data as ChainRow;

  return (
    <>
      <Link href={`/chains/${chain.id}`} className="text-sm text-zinc-500 hover:underline dark:text-zinc-400">
        ← {chain.name}
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Run chain</h1>
      <ChainFlow steps={chain.prompt_chain_steps ?? []} />
      <RunForm chainId={chain.id} />
    </>
  );
}

export default function RunPage({ params }: PageProps<"/chains/[chainId]/run">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-8">
      <Suspense fallback={<p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>}>
        <RunContent params={params} />
      </Suspense>
    </main>
  );
}
