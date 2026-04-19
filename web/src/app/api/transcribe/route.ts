import { groqTranscribe, readApiKeyFromRequest } from "@/lib/groq";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 400;

function isTransientError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  const causeCode =
    (err as Error & { cause?: { code?: string } }).cause?.code ?? "";
  return (
    msg.includes("fetch failed") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("socket hang up") ||
    causeCode === "ECONNRESET" ||
    causeCode === "ETIMEDOUT" ||
    causeCode === "UND_ERR_SOCKET" ||
    causeCode === "UND_ERR_CONNECT_TIMEOUT"
  );
}

export async function POST(request: Request) {
  const apiKey = readApiKeyFromRequest(request);
  if (!apiKey) {
    return Response.json({ error: "Missing or invalid x-groq-key header" }, { status: 401 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Missing 'file' in form data" }, { status: 400 });
  }

  const modelField = form.get("model");
  const model = typeof modelField === "string" && modelField.length > 0 ? modelField : "whisper-large-v3";
  const filename = file.name || "audio.webm";

  const buffer = await file.arrayBuffer();

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const blob = new Blob([buffer], { type: file.type || "audio/webm" });
      const res = await groqTranscribe(apiKey, blob, filename, model);

      if (!res.ok) {
        const errorText = await res.text();
        if (res.status >= 500 && attempt < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, RETRY_BASE_MS * attempt));
          continue;
        }
        return Response.json(
          { error: `Groq ${res.status}: ${errorText || res.statusText}` },
          { status: res.status },
        );
      }

      const data = (await res.json()) as { text?: unknown };
      const text = typeof data.text === "string" ? data.text : "";
      return Response.json({ text });
    } catch (err) {
      lastError = err;
      if (!isTransientError(err) || attempt === MAX_ATTEMPTS) break;
      await new Promise((r) => setTimeout(r, RETRY_BASE_MS * attempt));
    }
  }

  const message =
    lastError instanceof Error ? lastError.message : "Upstream request failed";
  return Response.json(
    { error: `Transcribe upstream failed after ${MAX_ATTEMPTS} attempts: ${message}` },
    { status: 502 },
  );
}
