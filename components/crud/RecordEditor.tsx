"use client";

import { useState } from "react";
import ActionForm from "@/components/crud/ActionForm";
import type { ActionState } from "@/lib/forms";

// Shows a record's read view, and swaps to an edit form on request. The
// fields are rendered on the server with the current values as defaults.
export default function RecordEditor({
  action,
  id,
  view,
  children,
  editLabel = "Edit",
  actions,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  id: string;
  view: React.ReactNode;
  children: React.ReactNode;
  editLabel?: string;
  /** Extra controls (e.g. a delete button) shown next to Edit. */
  actions?: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!editing) {
    return (
      <div className="flex flex-col gap-2">
        {view}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setSaved(false);
              setEditing(true);
            }}
            className="text-xs text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            {editLabel}
          </button>
          {actions}
          {saved && (
            <span role="status" className="text-xs text-green-700 dark:text-green-400">
              ✓ Changes saved.
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <ActionForm
      action={action}
      hidden={{ id }}
      submitLabel="Save"
      onSuccess={() => {
        setSaved(true);
        setEditing(false);
      }}
      onCancel={() => setEditing(false)}
    >
      {children}
    </ActionForm>
  );
}
