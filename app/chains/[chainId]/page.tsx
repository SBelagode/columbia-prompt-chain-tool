import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperadmin } from "@/lib/auth";
import { logReadError } from "@/lib/crud";
import { isUuid } from "@/lib/forms";
import { MAX_NAME, MAX_PROMPT, one } from "@/lib/chains";
import { createStep, deleteStep, updateStep } from "@/app/chains/actions";
import ChainEditor from "@/components/ChainEditor";
import ChainFlow from "@/components/ChainFlow";
import ChainHistory from "@/components/ChainHistory";
import ActionForm from "@/components/crud/ActionForm";
import ConfirmDeleteButton from "@/components/crud/ConfirmDeleteButton";
import RecordEditor from "@/components/crud/RecordEditor";
import { SelectField, TextAreaField, TextField } from "@/components/crud/fields";
import StepMoveButtons from "@/components/StepMoveButtons";

const linkClass =
  "rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900";

type ModelRef = { display_name: string; model_identifier: string };

type StepRow = {
  id: string;
  step_order: number;
  name: string;
  prompt_text: string;
  llm_model_id: string | null;
  llm_models: ModelRef | ModelRef[] | null;
};

type ChainRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  prompt_chain_steps: StepRow[] | null;
};

type ModelOption = { value: string; label: string };

function StepFields({ step, models }: { step?: StepRow; models: ModelOption[] }) {
  return (
    <>
      <TextField label="Name" name="name" defaultValue={step?.name} required maxLength={MAX_NAME} />
      <TextAreaField
        label="Prompt"
        name="prompt_text"
        defaultValue={step?.prompt_text}
        required
        maxLength={MAX_PROMPT}
        rows={6}
      />
      <SelectField
        label="Model"
        name="llm_model_id"
        defaultValue={step?.llm_model_id}
        options={models}
        emptyLabel="Default model"
      />
    </>
  );
}

function Step({
  step,
  position,
  count,
  models,
}: {
  step: StepRow;
  position: number;
  count: number;
  models: ModelOption[];
}) {
  const model = one(step.llm_models);
  return (
    <li id={`step-${step.id}`} className="flex scroll-mt-4 flex-col items-center gap-1">
      <div className="w-full rounded border border-zinc-200 p-3 dark:border-zinc-800">
        <RecordEditor
          action={updateStep}
          id={step.id}
          view={
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex min-w-0 items-center gap-2 text-sm font-medium">
                  <span className="shrink-0 rounded bg-zinc-900 px-1.5 py-0.5 text-xs text-white tabular-nums dark:bg-zinc-100 dark:text-zinc-900">
                    Step {position}
                  </span>
                  <span className="min-w-0 break-words">{step.name}</span>
                </h3>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {model ? (
                    <>
                      {model.display_name} ·{" "}
                      <span className="font-mono">{model.model_identifier}</span>
                    </>
                  ) : (
                    "Default model"
                  )}
                </span>
              </div>
              <pre className="max-h-60 overflow-y-auto rounded bg-zinc-50 p-2 font-mono text-xs whitespace-pre-wrap dark:bg-zinc-900">
                {step.prompt_text}
              </pre>
            </>
          }
          actions={
            <>
              <StepMoveButtons id={step.id} isFirst={position === 1} isLast={position === count} />
              <ConfirmDeleteButton
                action={deleteStep}
                id={step.id}
                title="Delete this step?"
                confirmLabel="Delete step"
              >
                {step.name}
              </ConfirmDeleteButton>
            </>
          }
        >
          <StepFields step={step} models={models} />
        </RecordEditor>
      </div>
      {position < count && (
        <span aria-hidden="true" className="text-zinc-500 dark:text-zinc-400">
          ↓
        </span>
      )}
    </li>
  );
}

async function ChainDetail({ params }: { params: PageProps<"/chains/[chainId]">["params"] }) {
  const { supabase } = await requireSuperadmin();
  const { chainId } = await params;
  if (!isUuid(chainId)) notFound();

  const [chainResult, modelsResult] = await Promise.all([
    supabase
      .from("prompt_chains")
      .select(
        "id, name, slug, description, prompt_chain_steps(id, step_order, name, prompt_text, llm_model_id, llm_models(display_name, model_identifier))",
      )
      .eq("id", chainId)
      .order("step_order", { referencedTable: "prompt_chain_steps" })
      .maybeSingle(),
    supabase
      .from("llm_models")
      .select("id, display_name, model_identifier, is_active")
      .order("display_name"),
  ]);

  if (chainResult.error || modelsResult.error) {
    const error = chainResult.error ?? modelsResult.error;
    if (error) logReadError("chains", error);
    return <p role="alert" className="text-sm text-red-700 dark:text-red-400">Couldn&apos;t load this chain.</p>;
  }
  if (!chainResult.data) notFound();

  const chain = chainResult.data as ChainRow;
  const steps = chain.prompt_chain_steps ?? [];
  // Inactive models stay listed so saving a step can't silently clear its model.
  const models: ModelOption[] = (modelsResult.data ?? []).map((m) => ({
    value: m.id as string,
    label: `${m.display_name}${m.is_active ? "" : " (inactive)"}`,
  }));

  return (
    <>
      <ChainEditor
        chain={chain}
        view={
          <>
            <h1 className="text-2xl font-semibold tracking-tight">{chain.name}</h1>
            <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">{chain.slug}</p>
            {chain.description && (
              <p className="text-sm text-zinc-700 dark:text-zinc-300">{chain.description}</p>
            )}
          </>
        }
      />

      <div className="flex flex-wrap gap-2">
        <Link href={`/chains/${chain.id}/run`} className={linkClass}>
          Run chain
        </Link>
        <a href="#history" className={linkClass}>
          Generated media
        </a>
      </div>

      <h2 className="text-base font-semibold">Execution flow</h2>
      <ChainFlow steps={steps} />

      <h2 className="text-base font-semibold">
        {steps.length} {steps.length === 1 ? "step" : "steps"}
      </h2>
      {steps.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No steps yet. Add the first one below.
        </p>
      ) : (
        <ol aria-label="Chain steps" className="flex flex-col gap-1">
          {steps.map((step, index) => (
            <Step
              key={step.id}
              step={step}
              position={index + 1}
              count={steps.length}
              models={models}
            />
          ))}
        </ol>
      )}

      <details className="rounded border border-zinc-200 dark:border-zinc-800">
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Add step</summary>
        <div className="border-t border-zinc-200 p-3 dark:border-zinc-800">
          <ActionForm
            action={createStep}
            hidden={{ chain_id: chain.id }}
            submitLabel="Add step"
            pendingLabel="Adding…"
            resetOnSuccess
          >
            <StepFields models={models} />
          </ActionForm>
        </div>
      </details>
    </>
  );
}

async function History({
  params,
  searchParams,
}: {
  params: PageProps<"/chains/[chainId]">["params"];
  searchParams: PageProps<"/chains/[chainId]">["searchParams"];
}) {
  const { chainId } = await params;
  if (!isUuid(chainId)) return null;
  return <ChainHistory chainId={chainId} searchParams={searchParams} />;
}

export default function ChainPage({ params, searchParams }: PageProps<"/chains/[chainId]">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-8">
      <Link href="/chains" className="text-sm text-zinc-500 hover:underline dark:text-zinc-400">
        ← All chains
      </Link>
      <Suspense fallback={<p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>}>
        <ChainDetail params={params} />
      </Suspense>

      <section id="history" className="flex scroll-mt-4 flex-col gap-3">
        <h2 className="text-base font-semibold">Generated media</h2>
        <Suspense fallback={<p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>}>
          <History params={params} searchParams={searchParams} />
        </Suspense>
      </section>
    </main>
  );
}
