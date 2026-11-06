"use client";

import { startTransition, useActionState, useRef } from "react";
import { IDLE_STATE, type ActionState } from "@/lib/forms";

export const primaryButtonClass =
  "rounded border border-zinc-900 bg-zinc-900 px-3 py-1 text-sm text-white hover:bg-zinc-700 disabled:opacity-50 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300";
export const secondaryButtonClass =
  "rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900";

// Submits through onSubmit rather than the action prop so React doesn't
// reset the fields after a failed save. The Server Action re-checks
// superadmin access; RLS decides whether the write lands.
export default function ActionForm({
  action,
  hidden,
  submitLabel,
  pendingLabel = "Saving…",
  resetOnSuccess = false,
  onSuccess,
  onCancel,
  className = "flex flex-col gap-3",
  children,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  hidden?: Record<string, string>;
  submitLabel: string;
  pendingLabel?: string;
  resetOnSuccess?: boolean;
  onSuccess?: () => void;
  onCancel?: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await action(prev, formData);
      if (result.status === "success") {
        if (resetOnSuccess) formRef.current?.reset();
        onSuccess?.();
      }
      return result;
    },
    IDLE_STATE,
  );

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const formData = new FormData(e.currentTarget);
    startTransition(() => formAction(formData));
  }

  return (
    <form ref={formRef} onSubmit={submit} className={className}>
      {hidden &&
        Object.entries(hidden).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>

      {state.status === "error" && (
        <p role="alert" className="text-xs text-red-700 dark:text-red-400">
          {state.message}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? pendingLabel : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            disabled={pending}
            onClick={onCancel}
            className={secondaryButtonClass}
          >
            Cancel
          </button>
        )}
        {state.status === "success" && !onSuccess && (
          <span role="status" className="text-xs text-green-700 dark:text-green-400">
            ✓ {state.message}
          </span>
        )}
      </div>
    </form>
  );
}
