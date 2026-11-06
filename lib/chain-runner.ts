import "server-only";

import { randomUUID } from "node:crypto";
import {
  GoogleGenerativeAI,
  type EnhancedGenerateContentResponse,
  type Part,
} from "@google/generative-ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { one, type RunEvent, type RunResult } from "@/lib/chains";
import {
  IMAGE_EXTENSIONS,
  IMAGE_USER_PROMPT,
  MEME_BUCKET,
  type AllowedImageType,
} from "@/lib/images";

// Used by steps with no model of their own. Same model as the other two apps.
const DEFAULT_MODEL = "gemini-3.5-flash-lite";

// Generated text limit, matching the admin app.
const MAX_GENERATED_TEXT = 5_000;

const RETRY_MESSAGE = "Gemini is busy right now. Please try again in a few moments.";
const FAILED_MESSAGE = "The run failed. Please try again.";
const SAVE_FAILED_MESSAGE = "The result couldn't be saved. Please try again.";
const LOG_FAILED_MESSAGE = "The run stopped because its log couldn't be saved. Nothing was published.";
const FINALIZE_FAILED_MESSAGE = "The result was saved, but its run log couldn't be finalized.";

// Past the first image step, a step only gets the image if its prompt asks about it.
const IMAGE_MENTION = /\b(images?|photos?|pictures?|memes?|screenshots?|visuals?)\b/i;

const TRANSIENT_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const TRANSIENT_PATTERN =
  /overload|unavailable|capacity|resource[_ ]?exhausted|rate.?limit|try again|timed? ?out|deadline|fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND/i;

type ModelRow = {
  id: string;
  display_name: string;
  model_identifier: string;
  supports_images: boolean;
  is_active: boolean;
};

type StepRow = {
  id: string;
  step_order: number;
  name: string;
  prompt_text: string;
  llm_models: ModelRow | ModelRow[] | null;
};

type PlannedStep = {
  id: string;
  name: string;
  prompt: string;
  modelId: string | null;
  modelIdentifier: string;
  modelName: string;
  sendImage: boolean;
};

type Image = { id: string; path: string; publicUrl: string };

export type RunInput = {
  text: string;
  image: { bytes: ArrayBuffer; mimeType: AllowedImageType } | null;
};

type ResponseStatus = "succeeded" | "failed" | "blocked";

function failure(message: string): RunResult {
  return { status: "error", message };
}

function isTransient(err: unknown): boolean {
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status === "number" && TRANSIENT_STATUSES.has(status)) return true;
  return TRANSIENT_PATTERN.test(err instanceof Error ? err.message : String(err));
}

// Log line with the API key scrubbed and the length capped.
export function describeError(err: unknown): string {
  const status = (err as { status?: unknown } | null)?.status;
  let message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) message = message.split(apiKey).join("[REDACTED]");
  if (message.length > 500) message = message.slice(0, 500) + "…";
  return typeof status === "number" ? `status=${status} ${message}` : message;
}

// Models sometimes wrap the output in quotes despite instructions.
function cleanCaption(text: string): string {
  return text.trim().replace(/^["“”']+|["“”']+$/g, "").trim();
}

// Loads the chain and checks every step before anything is uploaded or spent.
async function planSteps(
  supabase: SupabaseClient,
  chainId: string,
  hasImage: boolean,
): Promise<{ ok: true; steps: PlannedStep[] } | { ok: false; message: string }> {
  const [chainResult, defaultResult] = await Promise.all([
    supabase
      .from("prompt_chains")
      .select(
        "id, prompt_chain_steps(id, step_order, name, prompt_text, llm_models(id, display_name, model_identifier, supports_images, is_active))",
      )
      .eq("id", chainId)
      .order("step_order", { referencedTable: "prompt_chain_steps" })
      .maybeSingle(),
    supabase.from("llm_models").select("id").eq("model_identifier", DEFAULT_MODEL).limit(1).maybeSingle(),
  ]);

  if (chainResult.error) {
    console.error("[run] chain lookup failed:", chainResult.error.code, chainResult.error.message);
    return { ok: false, message: FAILED_MESSAGE };
  }
  if (!chainResult.data) return { ok: false, message: "This prompt chain no longer exists." };
  if (defaultResult.error) {
    console.error("[run] model lookup failed:", defaultResult.error.code, defaultResult.error.message);
  }

  const rows = (chainResult.data.prompt_chain_steps ?? []) as StepRow[];
  if (rows.length === 0) return { ok: false, message: "Add at least one step before running this chain." };

  const steps: (PlannedStep & { supportsImages: boolean })[] = [];
  for (const [index, row] of rows.entries()) {
    const model = one(row.llm_models);
    if (model && !model.is_active) {
      return { ok: false, message: `Step ${index + 1} uses an inactive model (${model.display_name}).` };
    }
    // GEMINI_API_KEY is the only provider credential this app has.
    if (model && !model.model_identifier.startsWith("gemini")) {
      return { ok: false, message: `Step ${index + 1} uses ${model.display_name}. Only Gemini models can run here.` };
    }
    steps.push({
      id: row.id,
      name: row.name,
      prompt: row.prompt_text,
      modelId: model?.id ?? (defaultResult.data?.id as string | undefined) ?? null,
      modelIdentifier: model?.model_identifier ?? DEFAULT_MODEL,
      modelName: model?.display_name ?? "Default model",
      supportsImages: model?.supports_images ?? true,
      sendImage: false,
    });
  }

  if (hasImage) {
    const first = steps.findIndex((step) => step.supportsImages);
    if (first === -1) {
      return { ok: false, message: "At least one step needs a model that supports images." };
    }
    steps.forEach((step, index) => {
      step.sendImage =
        step.supportsImages && (index === first || (index > first && IMAGE_MENTION.test(step.prompt)));
    });
  }
  return { ok: true, steps };
}

// Best effort: a leftover file or row is harmless, so failures are only logged.
async function discardImage(supabase: SupabaseClient, path: string, imageId: string | null) {
  const { error } = await supabase.storage.from(MEME_BUCKET).remove([path]);
  if (error) {
    console.error("[run] cleanup of unused upload failed:", error.message);
    return;
  }
  if (!imageId) return;
  const { error: rowError } = await supabase.from("images").delete().eq("id", imageId);
  if (rowError) console.error("[run] cleanup of images row failed:", rowError.code, rowError.message);
}

// Same layout as the consumer app: <user id>/<uuid>.<ext>, which satisfies the
// own-folder storage policy, plus a row in images.
async function saveImage(
  supabase: SupabaseClient,
  userId: string,
  bytes: ArrayBuffer,
  mimeType: AllowedImageType,
): Promise<Image | null> {
  const path = `${userId}/${randomUUID()}.${IMAGE_EXTENSIONS[mimeType]}`;
  const { error: uploadError } = await supabase.storage
    .from(MEME_BUCKET)
    .upload(path, bytes, { contentType: mimeType, upsert: false });
  if (uploadError) {
    console.error("[run] image upload failed:", uploadError.message);
    return null;
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(MEME_BUCKET).getPublicUrl(path);

  const id = randomUUID();
  const { error } = await supabase.from("images").insert({
    id,
    user_id: userId,
    storage_bucket: MEME_BUCKET,
    storage_path: path,
    public_url: publicUrl,
    mime_type: mimeType,
    size_bytes: bytes.byteLength,
  });
  if (error) {
    console.error("[run] images insert failed:", error.code, error.message);
    await discardImage(supabase, path, null);
    return null;
  }
  return { id, path, publicUrl };
}

// Returns false if the row wasn't written, which is how an RLS denial shows up.
async function recordResponse(
  supabase: SupabaseClient,
  requestId: string,
  step: PlannedStep,
  outcome: {
    status: ResponseStatus;
    latencyMs: number;
    response?: EnhancedGenerateContentResponse;
    responseText?: string;
    errorMessage?: string;
  },
): Promise<boolean> {
  const { response } = outcome;
  const { error } = await supabase.from("llm_responses").insert({
    generation_request_id: requestId,
    prompt_chain_step_id: step.id,
    llm_model_id: step.modelId,
    response_text: outcome.responseText ?? null,
    // The SDK attaches helper methods to the response; this keeps only the JSON payload.
    raw_response: response ? JSON.parse(JSON.stringify(response)) : null,
    status: outcome.status,
    error_message: outcome.errorMessage ?? null,
    latency_ms: outcome.latencyMs,
    input_tokens: response?.usageMetadata?.promptTokenCount ?? null,
    output_tokens: response?.usageMetadata?.candidatesTokenCount ?? null,
  });
  if (error) console.error("[run] llm_responses insert failed:", error.code, error.message);
  return !error;
}

// Moves the request out of pending. This has to come last: the llm_responses
// insert policy only accepts rows while the request is pending. An UPDATE that
// RLS filters out returns no error, so success means a row came back.
async function completeRequest(
  supabase: SupabaseClient,
  requestId: string,
  status: ResponseStatus,
  errorMessage: string | null = null,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("generation_requests")
    .update({ status, error_message: errorMessage, completed_at: new Date().toISOString() })
    .eq("id", requestId)
    .select("id");
  if (error) {
    console.error("[run] generation_requests update failed:", error.code, error.message);
    return false;
  }
  if (!data || data.length === 0) {
    console.error("[run] generation_requests update changed no rows:", requestId);
    return false;
  }
  return true;
}

function buildParts(
  step: PlannedStep,
  isFirst: boolean,
  input: string,
  image: RunInput["image"],
  imageData: string | null,
): Part[] {
  const parts: Part[] = [{ text: step.prompt }];
  if (input) {
    parts.push({
      text: isFirst
        ? `Original user input:\n<user_input>\n${input}\n</user_input>`
        : `Output of the previous step:\n<previous_step_output>\n${input}\n</previous_step_output>`,
    });
  }
  if (step.sendImage && image && imageData) {
    parts.push({ inlineData: { mimeType: image.mimeType, data: imageData } });
  }
  return parts;
}

// Runs the chain's steps one at a time in step_order, each receiving the
// previous step's output, then saves the last output as a generation. Every
// write runs under the superadmin's own JWT. Callers must already have called
// requireSuperadmin(). Progress goes to `emit`; messages are safe to display.
export async function runChain(
  supabase: SupabaseClient,
  userId: string,
  chainId: string,
  { text, image: input }: RunInput,
  emit: (event: RunEvent) => void,
): Promise<RunResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("[run] GEMINI_API_KEY is not set");
    return failure(FAILED_MESSAGE);
  }

  const plan = await planSteps(supabase, chainId, input !== null);
  if (!plan.ok) return failure(plan.message);
  const { steps } = plan;

  emit({
    type: "plan",
    steps: steps.map((step) => ({
      name: step.name,
      model: step.modelName,
      usesImage: step.sendImage,
    })),
  });

  let image: Image | null = null;
  if (input) {
    image = await saveImage(supabase, userId, input.bytes, input.mimeType);
    if (!image) return failure("The image couldn't be uploaded. Please try again.");
  }
  const savedImage = image;

  // Required here, unlike the consumer app's logging: this row is what links
  // the generation back to its chain.
  const userPrompt = text || IMAGE_USER_PROMPT;
  const requestId = randomUUID();
  const { error: requestError } = await supabase.from("generation_requests").insert({
    id: requestId,
    user_id: userId,
    image_id: savedImage?.id ?? null,
    prompt_chain_id: chainId,
    llm_model_id: steps[0].modelId,
    user_prompt: userPrompt,
    status: "pending",
  });
  if (requestError) {
    console.error("[run] generation_requests insert failed:", requestError.code, requestError.message);
    if (savedImage) await discardImage(supabase, savedImage.path, savedImage.id);
    return failure(FAILED_MESSAGE);
  }

  // The upload stays, so a failed request keeps its link to the image.
  async function abort(status: ResponseStatus, logMessage: string, message: string) {
    await completeRequest(supabase, requestId, status, logMessage);
    return failure(message);
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const imageData = input ? Buffer.from(input.bytes).toString("base64") : null;
    let currentInput = text;

    // Strictly sequential: each step needs the previous step's output.
    for (const [index, step] of steps.entries()) {
      const label = `Step ${index + 1}`;
      emit({ type: "step-start", index });
      const startedAt = performance.now();
      let response: EnhancedGenerateContentResponse;
      try {
        const result = await genAI
          .getGenerativeModel({ model: step.modelIdentifier })
          .generateContent(buildParts(step, index === 0, currentInput, input, imageData));
        response = result.response;
      } catch (err) {
        const latencyMs = Math.round(performance.now() - startedAt);
        const detail = describeError(err);
        const transient = isTransient(err);
        console.error(`[run] Gemini error at ${label}:`, detail);
        await recordResponse(supabase, requestId, step, { status: "failed", latencyMs, errorMessage: detail });
        return abort(
          "failed",
          `Gemini error at ${label} (${transient ? "transient" : "non-transient"})`,
          transient ? RETRY_MESSAGE : `${label} failed. Please try again.`,
        );
      }
      const latencyMs = Math.round(performance.now() - startedAt);

      // text() throws when the response was blocked (e.g. safety filters).
      let output = "";
      let blockedDetail = "Empty response";
      try {
        output = response.text().trim();
      } catch (err) {
        blockedDetail = describeError(err);
      }
      if (!output) {
        console.error(`[run] Gemini response blocked at ${label}:`, blockedDetail);
        await recordResponse(supabase, requestId, step, {
          status: "blocked",
          latencyMs,
          response,
          errorMessage: blockedDetail,
        });
        return abort("blocked", `${label} was blocked`, `Gemini returned nothing for ${label}. Try a different image or prompt.`);
      }

      const logged = await recordResponse(supabase, requestId, step, {
        status: "succeeded",
        latencyMs,
        response,
        responseText: output,
      });
      if (!logged) return abort("failed", `${label} could not be logged`, LOG_FAILED_MESSAGE);
      emit({ type: "step-done", index, output });
      currentInput = output;
    }

    const lastStep = steps[steps.length - 1];
    const caption = cleanCaption(currentInput);
    if (!caption || caption.length > MAX_GENERATED_TEXT) {
      return abort(
        "failed",
        "Final output was empty or too long",
        `The final output must be 1–${MAX_GENERATED_TEXT.toLocaleString()} characters. Try adjusting the last step.`,
      );
    }

    const { error } = await supabase.from("generations").insert({
      user_id: userId,
      user_prompt: userPrompt,
      generation_prompt: lastStep.prompt,
      generated_text: caption,
      source_image_url: savedImage?.publicUrl ?? null,
      image_id: savedImage?.id ?? null,
      generation_request_id: requestId,
      llm_model_id: lastStep.modelId,
    });
    if (error) {
      console.error("[run] generations insert failed:", error.code, error.message);
      return abort("failed", "Generation could not be saved", SAVE_FAILED_MESSAGE);
    }

    if (!(await completeRequest(supabase, requestId, "succeeded"))) return failure(FINALIZE_FAILED_MESSAGE);
    return { status: "success", caption, imageUrl: savedImage?.publicUrl ?? null };
  } catch (err) {
    console.error("[run] unexpected error:", describeError(err));
    return abort("failed", "Unexpected error during the run", FAILED_MESSAGE);
  }
}
