// Shared by Server Actions and the client forms that call them. Kept
// out of "use server" files, which may only export async functions.

export type ActionState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export const IDLE_STATE: ActionState = { status: "idle" };

export function fail(message: string): ActionState {
  return { status: "error", message };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/** A trimmed string field; "" when missing or not a string. */
export function textField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** Checkboxes are only submitted when checked. */
export function checkboxField(formData: FormData, name: string): boolean {
  return formData.get(name) === "on";
}

/**
 * An optional foreign-key select: null when empty, the UUID when valid,
 * undefined when the submitted value is malformed.
 */
export function optionalUuidField(
  formData: FormData,
  name: string,
): string | null | undefined {
  const value = textField(formData, name);
  if (!value) return null;
  return isUuid(value) ? value : undefined;
}

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Result of validating a submitted form. */
export type Parsed<T> = { ok: true; values: T } | { ok: false; error: string };

export function invalid(error: string): { ok: false; error: string } {
  return { ok: false, error };
}
