const endpointClass =
  "flex flex-col rounded border border-dashed border-zinc-300 px-3 py-1.5 dark:border-zinc-700";
const captionClass = "text-xs text-zinc-500 dark:text-zinc-400";

function Arrow() {
  return (
    <span aria-hidden="true" className="text-zinc-500 dark:text-zinc-400">
      →
    </span>
  );
}

// The order a run follows: Input → Step 1 → … → Output. Each step links to
// its card below. Steps must already be sorted by step_order.
export default function ChainFlow({ steps }: { steps: { id: string; name: string }[] }) {
  return (
    <ol aria-label="Execution flow" className="flex flex-wrap items-center gap-2 text-sm">
      <li className="flex items-center gap-2">
        <span className={endpointClass}>
          <span className="font-medium">Input</span>
          <span className={captionClass}>Image and/or text</span>
        </span>
        <Arrow />
      </li>

      {steps.map((step, index) => (
        <li key={step.id} className="flex min-w-0 items-center gap-2">
          <a
            href={`#step-${step.id}`}
            className="flex min-w-0 flex-col rounded border border-zinc-300 px-3 py-1.5 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            <span className="font-medium">Step {index + 1}</span>
            <span className={`${captionClass} max-w-40 truncate`}>{step.name}</span>
          </a>
          <Arrow />
        </li>
      ))}

      {steps.length === 0 && (
        <li className="flex items-center gap-2">
          <span className={captionClass}>No steps yet</span>
          <Arrow />
        </li>
      )}

      <li>
        <span className={endpointClass}>
          <span className="font-medium">Output</span>
          <span className={captionClass}>Final caption</span>
        </span>
      </li>
    </ol>
  );
}
