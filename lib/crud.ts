import "server-only";

import { refresh } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fail, type ActionState } from "@/lib/forms";

// Write helpers for the Server Actions. Callers must already have
// called requireSuperadmin() and pass its client, so every write runs under
// the superadmin's own JWT and RLS stays authoritative. Database details are
// logged server-side only; users see a generic message.

type DbError = { code?: string; message: string };

export type WriteMessages = {
  /** Shown for unique violations (23505). */
  duplicate?: string;
  /** Shown for foreign-key violations (23503). */
  inUse?: string;
};

function writeError(scope: string, error: DbError, messages: WriteMessages): ActionState {
  console.error(`[${scope}] write failed:`, error.code, error.message);
  switch (error.code) {
    case "23505":
      return fail(messages.duplicate ?? "That value already exists.");
    case "23503":
      return fail(messages.inUse ?? "This record is linked to other records.");
    case "23514":
    case "22P02":
    case "23502":
      return fail("One of the values isn't valid. Please check the form.");
    case "42501":
      return fail("You don't have permission to make this change.");
    default:
      return fail("Couldn't save changes. Please try again.");
  }
}

const GONE_MESSAGE = "This record no longer exists or you don't have permission to change it.";

export async function insertRow(
  supabase: SupabaseClient,
  scope: string,
  table: string,
  values: Record<string, unknown>,
  successMessage: string,
  messages: WriteMessages = {},
): Promise<ActionState> {
  const { error } = await supabase.from(table).insert(values);
  if (error) return writeError(scope, error, messages);
  refresh();
  return { status: "success", message: successMessage };
}

// .select("id") makes an RLS-filtered no-op detectable: zero rows come back.
export async function updateRow(
  supabase: SupabaseClient,
  scope: string,
  table: string,
  id: string,
  values: Record<string, unknown>,
  successMessage: string,
  messages: WriteMessages = {},
): Promise<ActionState> {
  const { data, error } = await supabase
    .from(table)
    .update(values)
    .eq("id", id)
    .select("id");
  if (error) return writeError(scope, error, messages);
  if (!data || data.length === 0) return fail(GONE_MESSAGE);
  refresh();
  return { status: "success", message: successMessage };
}

export async function deleteRow(
  supabase: SupabaseClient,
  scope: string,
  table: string,
  id: string,
  successMessage: string,
  messages: WriteMessages = {},
): Promise<ActionState> {
  const { data, error } = await supabase
    .from(table)
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return writeError(scope, error, messages);
  if (!data || data.length === 0) return fail(GONE_MESSAGE);
  refresh();
  return { status: "success", message: successMessage };
}

/** Logs a read failure; pages render a generic message instead. */
export function logReadError(scope: string, error: DbError) {
  console.error(`[${scope}]`, error.code, error.message);
}
