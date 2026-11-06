import type { NextRequest } from "next/server";
import { requireSuperadmin } from "@/lib/auth";
import { describeError, runChain } from "@/lib/chain-runner";
import { MAX_INPUT_TEXT, type RunEvent, type RunResult } from "@/lib/chains";
import { isUuid, textField } from "@/lib/forms";
import {
  MAX_IMAGE_BYTES,
  MAX_IMAGE_LABEL,
  sniffImageType,
  type AllowedImageType,
} from "@/lib/images";

// A run makes one Gemini call per step.
export const maxDuration = 120;

const STREAM_HEADERS = {
  "Content-Type": "application/x-ndjson; charset=utf-8",
  "Cache-Control": "no-store, no-transform",
  "X-Accel-Buffering": "no",
};

function line(event: RunEvent): string {
  return `${JSON.stringify(event)}\n`;
}

function reject(message: string): Response {
  return new Response(line({ type: "result", result: { status: "error", message } }), {
    headers: STREAM_HEADERS,
  });
}

// Server Actions check this automatically; Route Handlers don't.
function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest, ctx: RouteContext<"/chains/[chainId]/run/stream">) {
  const { supabase, user } = await requireSuperadmin();
  if (!isSameOrigin(request)) return new Response("Forbidden", { status: 403 });

  const { chainId } = await ctx.params;
  if (!isUuid(chainId)) return reject("Invalid chain.");

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return reject("The upload couldn't be read. Please try again.");
  }

  const text = textField(formData, "text");
  if (text.length > MAX_INPUT_TEXT) {
    return reject(`Text must be ${MAX_INPUT_TEXT.toLocaleString()} characters or fewer.`);
  }

  let image: { bytes: ArrayBuffer; mimeType: AllowedImageType } | null = null;
  const file = formData.get("image");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_IMAGE_BYTES) return reject(`Images must be ${MAX_IMAGE_LABEL} or smaller.`);
    const bytes = await file.arrayBuffer();
    const mimeType = sniffImageType(bytes);
    if (!mimeType) return reject("Please upload a JPEG, PNG, or WebP image.");
    image = { bytes, mimeType };
  }

  if (!text && !image) return reject("Add an image or some text first.");

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: RunEvent) => {
        try {
          controller.enqueue(encoder.encode(line(event)));
        } catch {
          // The browser left. The run keeps going so its records are finalized.
        }
      };

      let result: RunResult;
      try {
        result = await runChain(supabase, user.id, chainId, { text, image }, emit);
      } catch (err) {
        console.error("[run] unexpected error:", describeError(err));
        result = { status: "error", message: "The run failed. Please try again." };
      }

      emit({ type: "result", result });
      try {
        controller.close();
      } catch {
        // Already closed because the browser left.
      }
    },
  });

  return new Response(stream, { headers: STREAM_HEADERS });
}
