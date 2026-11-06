import Link from "next/link";
import { requireSuperadmin } from "@/lib/auth";
import { logReadError } from "@/lib/crud";
import { one } from "@/lib/chains";

const PAGE_SIZE = 10;

const STATUS_CLASSES: Record<string, string> = {
  succeeded: "border-green-700 text-green-800 dark:border-green-500 dark:text-green-400",
  failed: "border-red-700 text-red-800 dark:border-red-500 dark:text-red-400",
  blocked: "border-amber-700 text-amber-800 dark:border-amber-500 dark:text-amber-400",
};
const NEUTRAL_STATUS = "border-zinc-400 text-zinc-700 dark:border-zinc-600 dark:text-zinc-300";

type StepRef = { step_order: number; name: string };
type ResponseRow = {
  id: string;
  response_text: string | null;
  status: string;
  latency_ms: number | null;
  created_at: string;
  prompt_chain_steps: StepRef | StepRef[] | null;
};
type ImageRef = { public_url: string };
type GenerationRef = { generated_text: string; source_image_url: string | null };
type RequestRow = {
  id: string;
  status: string;
  error_message: string | null;
  created_at: string;
  images: ImageRef | ImageRef[] | null;
  generations: GenerationRef | GenerationRef[] | null;
  llm_responses: ResponseRow[] | null;
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-xs capitalize ${STATUS_CLASSES[status] ?? NEUTRAL_STATUS}`}
    >
      {status}
    </span>
  );
}

// UTC, so the server and browser always render the same text.
function formatTime(value: string): string {
  return `${new Date(value).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function Run({ run }: { run: RequestRow }) {
  const generation = one(run.generations);
  const imageUrl = one(run.images)?.public_url ?? generation?.source_image_url;
  const responses = [...(run.llm_responses ?? [])].sort(
    (a, b) =>
      (one(a.prompt_chain_steps)?.step_order ?? 0) - (one(b.prompt_chain_steps)?.step_order ?? 0) ||
      a.created_at.localeCompare(b.created_at),
  );

  return (
    <li className="flex flex-col gap-2 rounded border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusBadge status={run.status} />
        <time dateTime={run.created_at} className="text-xs text-zinc-600 dark:text-zinc-400">
          {formatTime(run.created_at)}
        </time>
      </div>

      {imageUrl && (
        // Supabase Storage public URL; plain <img> avoids remote image config.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={generation?.generated_text ?? "Source image"}
          loading="lazy"
          className="max-h-72 w-fit max-w-full rounded object-contain"
        />
      )}

      {generation ? (
        <p className="text-sm font-medium whitespace-pre-wrap">{generation.generated_text}</p>
      ) : (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {run.error_message ?? "No output was saved for this run."}
        </p>
      )}

      {responses.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs text-zinc-600 dark:text-zinc-400">
            Step responses ({responses.length})
          </summary>
          <ol className="mt-2 flex flex-col gap-2">
            {responses.map((response) => {
              const step = one(response.prompt_chain_steps);
              return (
                <li key={response.id} className="flex flex-col gap-1">
                  <p className="flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                    <span>{step ? `Step ${step.step_order}: ${step.name}` : "Deleted step"}</span>
                    <StatusBadge status={response.status} />
                    {response.latency_ms !== null && <span>{response.latency_ms} ms</span>}
                  </p>
                  {response.response_text && (
                    <p className="whitespace-pre-wrap">{response.response_text}</p>
                  )}
                </li>
              );
            })}
          </ol>
        </details>
      )}
    </li>
  );
}

// Every execution of one chain, newest first. llm_responses.error_message
// holds provider detail, so it's deliberately not loaded here.
export default async function ChainHistory({
  chainId,
  searchParams,
}: {
  chainId: string;
  searchParams: PageProps<"/chains/[chainId]">["searchParams"];
}) {
  const { supabase } = await requireSuperadmin();
  const { page: rawPage } = await searchParams;
  const page = typeof rawPage === "string" && /^[1-9]\d{0,5}$/.test(rawPage) ? Number(rawPage) : 1;
  const from = (page - 1) * PAGE_SIZE;

  const { data, count, error } = await supabase
    .from("generation_requests")
    .select(
      "id, status, error_message, created_at, images(public_url), generations(generated_text, source_image_url), llm_responses(id, response_text, status, latency_ms, created_at, prompt_chain_steps(step_order, name))",
      { count: "exact" },
    )
    .eq("prompt_chain_id", chainId)
    .order("created_at", { ascending: false })
    .order("id")
    .range(from, from + PAGE_SIZE - 1);

  if (error) {
    logReadError("history", error);
    return <p role="alert" className="text-sm text-red-700 dark:text-red-400">Couldn&apos;t load this chain&apos;s history.</p>;
  }

  const runs = (data ?? []) as unknown as RequestRow[];
  const total = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (target: number) =>
    `/chains/${chainId}${target > 1 ? `?page=${target}` : ""}#history`;

  return (
    <>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {total === 0
          ? "This chain hasn't been run yet."
          : `${total} ${total === 1 ? "run" : "runs"}, newest first.`}
      </p>

      {runs.length > 0 && (
        <ul aria-label="Chain runs" className="flex flex-col gap-3">
          {runs.map((run) => (
            <Run key={run.id} run={run} />
          ))}
        </ul>
      )}

      {pageCount > 1 && (
        <nav aria-label="History pages" className="flex items-center gap-3 text-sm">
          {page > 1 && (
            <Link href={pageHref(page - 1)} className="underline">
              Newer
            </Link>
          )}
          <span className="text-zinc-600 tabular-nums dark:text-zinc-400">
            Page {page} of {pageCount}
          </span>
          {page < pageCount && (
            <Link href={pageHref(page + 1)} className="underline">
              Older
            </Link>
          )}
        </nav>
      )}
    </>
  );
}
