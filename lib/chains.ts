// Shared by pages, Server Actions and client forms. Kept out of "use server"
// files, which may only export async functions.

// The consumer app looks this chain up by slug, so it can't be deleted and
// its slug can't change. Its name, description and steps can be edited.
export const DEFAULT_CHAIN_SLUG = "default-columbia-image-caption";

export const MAX_NAME = 200;
export const MAX_SLUG = 200;
export const MAX_DESCRIPTION = 2_000;
// Matches the generation_prompt limit in the admin app.
export const MAX_PROMPT = 20_000;
export const MAX_INPUT_TEXT = 5_000;

/** A URL-safe slug from free text, or "" if nothing usable remains. Matches SLUG_PATTERN. */
export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, MAX_SLUG)
    .replace(/^-+|-+$/g, "");
}

export type RunResult =
  | { status: "error"; message: string }
  | { status: "success"; caption: string; imageUrl: string | null };

// One line of the run stream. Messages are always safe to show to the user.
export type RunEvent =
  | { type: "plan"; steps: { name: string; model: string; usesImage: boolean }[] }
  | { type: "step-start"; index: number }
  | { type: "step-done"; index: number; output: string }
  | { type: "result"; result: RunResult };

/** Supabase returns an embedded to-one relation as an object (or, without a
 *  detected unique key, a one-element array). */
export function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
