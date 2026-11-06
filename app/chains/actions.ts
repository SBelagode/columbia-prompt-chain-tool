"use server";

import { randomUUID } from "node:crypto";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireSuperadmin } from "@/lib/auth";
import { deleteRow, insertRow, logReadError, updateRow } from "@/lib/crud";
import {
  DEFAULT_CHAIN_SLUG,
  MAX_DESCRIPTION,
  MAX_NAME,
  MAX_PROMPT,
  MAX_SLUG,
  slugify,
} from "@/lib/chains";
import {
  IDLE_STATE,
  SLUG_PATTERN,
  fail,
  invalid,
  isUuid,
  optionalUuidField,
  textField,
  type ActionState,
  type Parsed,
} from "@/lib/forms";

type Supabase = Awaited<ReturnType<typeof requireSuperadmin>>["supabase"];

const CHAIN_MESSAGES = {
  duplicate: "A chain with this slug already exists. Please enter a different slug.",
  inUse: "This chain is linked to other records, so it can't be deleted.",
};
const STEP_MESSAGES = {
  duplicate: "Another step just took this position. Please try again.",
  inUse: "This step has recorded responses, so it can't be deleted.",
};
// A foreign-key failure while saving means the chain or model has gone.
const STEP_SAVE_MESSAGES = {
  ...STEP_MESSAGES,
  inUse: "This chain or the selected model no longer exists. Please reload the page.",
};
const LOAD_FAILED = "Couldn't load this record. Please try again.";
const PROTECTED_DELETE = "The default chain can't be deleted.";

type ChainValues = { name: string; description: string | null };

function parseChain(formData: FormData): Parsed<ChainValues> {
  const name = textField(formData, "name");
  const description = textField(formData, "description");
  if (!name || name.length > MAX_NAME) return invalid(`Name must be 1–${MAX_NAME} characters.`);
  if (description.length > MAX_DESCRIPTION) {
    return invalid(`Description must be ${MAX_DESCRIPTION.toLocaleString()} characters or fewer.`);
  }
  return { ok: true, values: { name, description: description || null } };
}

// An explicit slug is used as typed; otherwise it comes from the name.
function parseSlug(formData: FormData, name: string): Parsed<string> {
  const slug = textField(formData, "slug") || slugify(name);
  if (!slug) return invalid("Please enter a slug. This name doesn't contain any usable letters or numbers.");
  if (slug.length > MAX_SLUG || !SLUG_PATTERN.test(slug)) {
    return invalid("Slug must use lowercase letters, numbers and single hyphens.");
  }
  return { ok: true, values: slug };
}

type StepValues = { name: string; prompt_text: string; llm_model_id: string | null };

function parseStep(formData: FormData): Parsed<StepValues> {
  const name = textField(formData, "name");
  const promptText = textField(formData, "prompt_text");
  const modelId = optionalUuidField(formData, "llm_model_id");
  if (!name || name.length > MAX_NAME) return invalid(`Name must be 1–${MAX_NAME} characters.`);
  if (!promptText || promptText.length > MAX_PROMPT) {
    return invalid(`Prompt must be 1–${MAX_PROMPT.toLocaleString()} characters.`);
  }
  if (modelId === undefined) return invalid("Please choose a valid model.");
  return { ok: true, values: { name, prompt_text: promptText, llm_model_id: modelId } };
}

async function chainSlug(supabase: Supabase, id: string) {
  const { data, error } = await supabase
    .from("prompt_chains")
    .select("slug")
    .eq("id", id)
    .maybeSingle();
  if (error) logReadError("chains", error);
  return { slug: data?.slug as string | undefined, error };
}

async function orderedStepIds(supabase: Supabase, chainId: string): Promise<string[] | null> {
  const { data, error } = await supabase
    .from("prompt_chain_steps")
    .select("id")
    .eq("prompt_chain_id", chainId)
    .order("step_order");
  if (error) {
    logReadError("steps", error);
    return null;
  }
  return (data ?? []).map((row) => row.id as string);
}

async function saveOrder(supabase: Supabase, chainId: string, stepIds: string[]) {
  const { error } = await supabase.rpc("reorder_prompt_chain_steps", {
    p_chain_id: chainId,
    p_step_ids: stepIds,
  });
  if (error) console.error("[steps] reorder failed:", error.code, error.message);
  return !error;
}

async function stepChainId(supabase: Supabase, stepId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("prompt_chain_steps")
    .select("prompt_chain_id")
    .eq("id", stepId)
    .maybeSingle();
  if (error) logReadError("steps", error);
  return (data?.prompt_chain_id as string | undefined) ?? null;
}

export async function createChain(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireSuperadmin();
  const parsed = parseChain(formData);
  if (!parsed.ok) return fail(parsed.error);
  const slug = parseSlug(formData, parsed.values.name);
  if (!slug.ok) return fail(slug.error);

  const id = randomUUID();
  const result = await insertRow(
    supabase,
    "chains",
    "prompt_chains",
    { id, slug: slug.values, ...parsed.values },
    "Chain created.",
    CHAIN_MESSAGES,
  );
  if (result.status === "error") return result;
  redirect(`/chains/${id}`);
}

export async function updateChain(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireSuperadmin();
  const id = textField(formData, "id");
  if (!isUuid(id)) return fail("Invalid chain.");
  const parsed = parseChain(formData);
  if (!parsed.ok) return fail(parsed.error);

  // Only name and description: the slug is set once at creation, which also
  // keeps the default chain's slug fixed.
  return updateRow(
    supabase,
    "chains",
    "prompt_chains",
    id,
    { ...parsed.values, updated_at: new Date().toISOString() },
    "Changes saved.",
    CHAIN_MESSAGES,
  );
}

export async function deleteChain(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireSuperadmin();
  const id = textField(formData, "id");
  if (!isUuid(id)) return fail("Invalid chain.");

  // The delete policy enforces this too; this check gives a clear message.
  const { slug, error } = await chainSlug(supabase, id);
  if (error) return fail(LOAD_FAILED);
  if (slug === DEFAULT_CHAIN_SLUG) return fail(PROTECTED_DELETE);

  const result = await deleteRow(supabase, "chains", "prompt_chains", id, "Chain deleted.", CHAIN_MESSAGES);
  if (result.status === "error") return result;
  redirect("/chains");
}

export async function createStep(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireSuperadmin();
  const chainId = textField(formData, "chain_id");
  if (!isUuid(chainId)) return fail("Invalid chain.");
  const parsed = parseStep(formData);
  if (!parsed.ok) return fail(parsed.error);

  // Older rows may have gaps, so go by the highest position, not the count.
  const { data: last, error } = await supabase
    .from("prompt_chain_steps")
    .select("step_order")
    .eq("prompt_chain_id", chainId)
    .order("step_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    logReadError("steps", error);
    return fail(LOAD_FAILED);
  }

  return insertRow(
    supabase,
    "steps",
    "prompt_chain_steps",
    { ...parsed.values, prompt_chain_id: chainId, step_order: (last?.step_order ?? 0) + 1 },
    "Step added.",
    STEP_SAVE_MESSAGES,
  );
}

export async function updateStep(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireSuperadmin();
  const id = textField(formData, "id");
  if (!isUuid(id)) return fail("Invalid step.");
  const parsed = parseStep(formData);
  if (!parsed.ok) return fail(parsed.error);
  return updateRow(
    supabase,
    "steps",
    "prompt_chain_steps",
    id,
    { ...parsed.values, updated_at: new Date().toISOString() },
    "Changes saved.",
    STEP_SAVE_MESSAGES,
  );
}

export async function deleteStep(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireSuperadmin();
  const id = textField(formData, "id");
  if (!isUuid(id)) return fail("Invalid step.");

  const chainId = await stepChainId(supabase, id);
  if (!chainId) return fail("This step no longer exists.");

  const result = await deleteRow(supabase, "steps", "prompt_chain_steps", id, "Step deleted.", STEP_MESSAGES);
  if (result.status === "error") return result;

  // Close the gap: the consumer app looks up step_order 1 on the default chain.
  const ids = await orderedStepIds(supabase, chainId);
  if (!ids || !(await saveOrder(supabase, chainId, ids))) {
    return fail("The step was deleted, but the remaining steps couldn't be renumbered.");
  }
  return result;
}

export async function moveStep(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireSuperadmin();
  const id = textField(formData, "id");
  const direction = textField(formData, "direction");
  if (!isUuid(id) || (direction !== "up" && direction !== "down")) return fail("Invalid step.");

  // One locked database call: the order is read and saved in the same
  // transaction, so overlapping moves can't overwrite each other.
  const { data: moved, error } = await supabase.rpc("move_prompt_chain_step", {
    p_step_id: id,
    p_direction: direction,
  });

  // On every outcome, so a stale page always ends up showing the stored order.
  refresh();

  if (error) {
    console.error("[steps] move failed:", error.code, error.message);
    if (error.code === "P0002") return fail("This step no longer exists.");
    if (error.code === "42501") return fail("You don't have permission to reorder these steps.");
    return fail("Couldn't reorder the steps. Please try again.");
  }
  return moved ? { status: "success", message: "Order saved." } : IDLE_STATE;
}
