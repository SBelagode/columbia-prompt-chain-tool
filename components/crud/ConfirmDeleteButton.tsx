"use client";

import { useActionState, useId, useRef } from "react";
import { IDLE_STATE, type ActionState } from "@/lib/forms";

// The first click only opens a confirmation dialog; the delete runs on the
// server after the user confirms.
export default function ConfirmDeleteButton({
  action,
  id,
  title,
  confirmLabel,
  warning,
  children,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  id: string;
  title: string;
  confirmLabel: string;
  /** What else is affected; "This can't be undone." is appended. */
  warning?: React.ReactNode;
  /** A summary of the record being deleted. */
  children?: React.ReactNode;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, formAction, pending] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await action(prev, formData);
      if (result.status === "success") dialogRef.current?.close();
      return result;
    },
    IDLE_STATE,
  );

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="text-xs text-red-700 underline-offset-2 hover:underline dark:text-red-400"
      >
        Delete
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onCancel={(e) => {
          if (pending) e.preventDefault();
        }}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded border border-zinc-200 bg-white p-0 text-zinc-900 backdrop:bg-black/40 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
      >
        <form action={formAction} className="flex flex-col gap-4 p-4">
          <input type="hidden" name="id" value={id} />

          <h2 id={titleId} className="text-base font-semibold">
            {title}
          </h2>

          {children && (
            <div className="rounded border border-zinc-200 p-3 text-sm dark:border-zinc-800">
              {children}
            </div>
          )}

          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {warning ? <>{warning} </> : null}This can&apos;t be undone.
          </p>

          {state.status === "error" && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-400">
              {state.message}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              autoFocus
              disabled={pending}
              onClick={() => dialogRef.current?.close()}
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded border border-red-700 bg-red-700 px-3 py-1.5 text-sm text-white hover:bg-red-800 disabled:opacity-50"
            >
              {pending ? "Deleting…" : confirmLabel}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
