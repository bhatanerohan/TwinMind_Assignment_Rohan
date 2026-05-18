import { useSettings } from "@/lib/store";
import type { TranscriptChunk } from "@/lib/types";

export async function uploadChunk(
  blob: Blob,
  startedAt: number,
): Promise<TranscriptChunk> {
  const { whisperModel } = useSettings.getState().settings;

  const form = new FormData();
  const file = new File([blob], `chunk-${startedAt}.webm`, {
    type: blob.type || "audio/webm",
  });
  form.append("file", file);
  form.append("model", whisperModel);

  const res = await fetch("/api/transcribe", {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Transcribe failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { text?: unknown };
  const text = typeof data.text === "string" ? data.text.trim() : "";

  return {
    id: crypto.randomUUID(),
    text,
    startedAt,
    endedAt: Date.now(),
  };
}
