"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MAX_INPUT_TEXT, type RunEvent, type RunResult } from "@/lib/chains";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_LABEL,
  isAllowedImageType,
} from "@/lib/images";
import { primaryButtonClass } from "@/components/crud/ActionForm";
import { inputClass } from "@/components/crud/fields";

type StepStatus = "waiting" | "running" | "done" | "failed";

type StepProgress = {
  name: string;
  model: string;
  usesImage: boolean;
  status: StepStatus;
  output: string | null;
};

const STATUS_LABELS: Record<StepStatus, string> = {
  waiting: "Waiting",
  running: "Running…",
  done: "Done",
  failed: "Failed",
};

const STATUS_CLASSES: Record<StepStatus, string> = {
  waiting: "text-zinc-500 dark:text-zinc-400",
  running: "font-medium text-zinc-900 dark:text-zinc-100",
  done: "text-green-700 dark:text-green-400",
  failed: "text-red-700 dark:text-red-400",
};

const CONNECTION_LOST = "The connection was lost before the run finished. Check this chain's history before running it again.";
const NO_ACCESS = "Your session has ended or you no longer have access. Please reload the page.";

function applyEvent(steps: StepProgress[], event: RunEvent): StepProgress[] {
  switch (event.type) {
    case "plan":
      return event.steps.map((step) => ({ ...step, status: "waiting", output: null }));
    case "step-start":
      return steps.map((step, i) => (i === event.index ? { ...step, status: "running" } : step));
    case "step-done":
      return steps.map((step, i) =>
        i === event.index ? { ...step, status: "done", output: event.output } : step,
      );
    case "result":
      return event.result.status === "error"
        ? steps.map((step) => (step.status === "running" ? { ...step, status: "failed" } : step))
        : steps;
  }
}

// The file lives in state so it survives a failed run.
export default function RunForm({ chainId }: { chainId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<StepProgress[]>([]);
  const [result, setResult] = useState<RunResult | null>(null);
  // Drops a second submit that arrives before `running` re-renders.
  const inFlight = useRef(false);

  // Release the current preview's object URL when it changes or on unmount.
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  // Quick client-side checks for feedback; the server re-validates the bytes.
  function selectFile(next: File | undefined) {
    if (!next) return;
    if (!isAllowedImageType(next.type)) {
      setFileError("Please choose a JPEG, PNG, or WebP image.");
      return;
    }
    if (next.size > MAX_IMAGE_BYTES) {
      setFileError(`Images must be ${MAX_IMAGE_LABEL} or smaller.`);
      return;
    }
    setFileError(null);
    setFile(next);
    setPreviewUrl(URL.createObjectURL(next));
  }

  function clearFile() {
    setFile(null);
    setPreviewUrl(null);
  }

  function handleEvent(event: RunEvent) {
    setSteps((current) => applyEvent(current, event));
    if (event.type === "result") setResult(event.result);
  }

  function failRun(message: string) {
    handleEvent({ type: "result", result: { status: "error", message } });
  }

  async function run(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inFlight.current || (!file && !text.trim())) return;
    inFlight.current = true;
    setRunning(true);
    setSteps([]);
    setResult(null);

    const formData = new FormData();
    formData.set("text", text);
    if (file) formData.set("image", file);

    let finished = false;
    try {
      const response = await fetch(`/chains/${chainId}/run/stream`, { method: "POST", body: formData });
      // The proxy answers with a redirect to an HTML page if access was lost.
      if (!response.ok || !response.body || !response.headers.get("content-type")?.includes("ndjson")) {
        failRun(NO_ACCESS);
        finished = true;
        return;
      }

      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const raw of lines) {
          if (!raw) continue;
          const event = JSON.parse(raw) as RunEvent;
          handleEvent(event);
          if (event.type === "result") finished = true;
        }
      }
    } catch {
      // Handled below: the stream ended without a result.
    } finally {
      if (!finished) failRun(CONNECTION_LOST);
      inFlight.current = false;
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={run} className="flex flex-col gap-4">
        <fieldset disabled={running} className="contents">
          <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
            <span>Image (optional)</span>
            <input
              type="file"
              accept={ALLOWED_IMAGE_TYPES.join(",")}
              onChange={(e) => {
                selectFile(e.target.files?.[0]);
                // Allow re-selecting the same file.
                e.target.value = "";
              }}
              className="text-sm text-zinc-900 file:mr-3 file:rounded file:border file:border-zinc-300 file:bg-transparent file:px-3 file:py-1.5 file:text-sm hover:file:bg-zinc-100 dark:text-zinc-100 dark:file:border-zinc-700 dark:hover:file:bg-zinc-900"
            />
            <span>JPEG, PNG, or WebP up to {MAX_IMAGE_LABEL}.</span>
          </label>

          {fileError && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-400">
              {fileError}
            </p>
          )}

          {previewUrl && (
            <div className="flex flex-col items-start gap-1">
              {/* Local object URL preview; plain <img> is required for blob: URLs. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Selected image preview"
                className="max-h-64 w-fit rounded border border-zinc-200 object-contain dark:border-zinc-800"
              />
              <button type="button" onClick={clearFile} className="text-xs underline">
                Remove image
              </button>
            </div>
          )}

          <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
            <span>Text (optional)</span>
            <textarea
              name="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={MAX_INPUT_TEXT}
              rows={3}
              className={inputClass}
            />
          </label>
        </fieldset>

        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Steps run one at a time, each receiving the previous step&apos;s output. The final
          output is saved and appears on the public feed.
        </p>

        <div>
          <button
            type="submit"
            disabled={running || (!file && !text.trim())}
            className={primaryButtonClass}
          >
            {running ? "Running…" : "Run Chain"}
          </button>
        </div>
      </form>

      {steps.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">Progress</h2>
          <ol aria-label="Run progress" className="flex flex-col gap-2">
            {steps.map((step, index) => (
              <li
                key={index}
                data-status={step.status}
                className="rounded border border-zinc-200 p-3 dark:border-zinc-800"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <p className="min-w-0 break-words font-medium">
                    Step {index + 1}: {step.name}
                  </p>
                  <p role="status" className={`text-xs ${STATUS_CLASSES[step.status]}`}>
                    {STATUS_LABELS[step.status]}
                  </p>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {step.model}
                  {step.usesImage && " · sees the image"}
                </p>
                {step.output !== null && (
                  <details className="mt-2 text-sm">
                    <summary className="cursor-pointer text-xs text-zinc-500 dark:text-zinc-400">
                      Output
                    </summary>
                    <p className="mt-1 whitespace-pre-wrap">{step.output}</p>
                  </details>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {result?.status === "error" && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {result.message}
        </p>
      )}

      {result?.status === "success" && (
        <section className="flex flex-col gap-3 rounded border border-zinc-200 p-3 dark:border-zinc-800">
          <h2 className="text-base font-semibold">Final output</h2>
          {result.imageUrl && (
            <>
              {/* Supabase Storage public URL; plain <img> avoids remote image config. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={result.imageUrl}
                alt={result.caption}
                className="max-h-80 w-fit rounded object-contain"
              />
            </>
          )}
          <p className="text-sm font-medium whitespace-pre-wrap">{result.caption}</p>
          <Link href={`/chains/${chainId}#history`} className="text-sm underline">
            View this chain&apos;s history
          </Link>
        </section>
      )}
    </div>
  );
}
