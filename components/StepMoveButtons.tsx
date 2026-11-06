"use client";

import { useActionState } from "react";
import { moveStep } from "@/app/chains/actions";
import { IDLE_STATE } from "@/lib/forms";

const buttonClass =
  "rounded border border-zinc-300 px-2 py-0.5 text-xs hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-900";

export default function StepMoveButtons({
  id,
  isFirst,
  isLast,
}: {
  id: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [state, formAction, pending] = useActionState(moveStep, IDLE_STATE);

  return (
    <form action={formAction} className="flex items-center gap-1">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        name="direction"
        value="up"
        disabled={pending || isFirst}
        aria-label="Move step up"
        className={buttonClass}
      >
        ↑
      </button>
      <button
        type="submit"
        name="direction"
        value="down"
        disabled={pending || isLast}
        aria-label="Move step down"
        className={buttonClass}
      >
        ↓
      </button>
      {state.status === "error" && (
        <span role="alert" className="text-xs text-red-700 dark:text-red-400">
          {state.message}
        </span>
      )}
      {state.status === "success" && (
        <span role="status" className="sr-only">
          {state.message}
        </span>
      )}
    </form>
  );
}
