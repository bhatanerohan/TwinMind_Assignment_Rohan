import { groqChat, readApiKeyFromRequest, type GroqChatMessage } from "@/lib/groq";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ChatRequestBody {
  transcript: string;
  systemPrompt: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  userMessage: string;
  model: string;
  fromSuggestion?: { title: string; preview: string };
}

const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 500;

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

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const asSeconds = Number(header);
  if (Number.isFinite(asSeconds) && asSeconds > 0) {
    return Math.min(asSeconds * 1000, 10_000);
  }
  return null;
}

function friendlyErrorBody(status: number, upstreamText: string): string {
  if (status === 429) {
    return `Groq rate limit hit (429). ${upstreamText || "Free tier is 8K TPM on chat — slow down or upgrade to Dev tier."}`;
  }
  if (status >= 500) {
    return `Groq upstream error (${status}). ${upstreamText || "Try again in a moment."}`;
  }
  return upstreamText || `Upstream returned ${status}`;
}

export async function POST(request: Request) {
  const apiKey = readApiKeyFromRequest(request);
  if (!apiKey) {
    return Response.json({ error: "Missing or invalid x-groq-key header" }, { status: 401 });
  }

  const body = (await request.json()) as ChatRequestBody;
  const { transcript, systemPrompt, history, userMessage, model, fromSuggestion } = body;

  const effectiveUserMessage =
    userMessage.trim().length > 0
      ? userMessage
      : fromSuggestion
        ? `Please expand on this suggestion with a detailed, actionable answer grounded in the transcript:\n\n"${fromSuggestion.title}" — ${fromSuggestion.preview}`
        : userMessage;

  if (!effectiveUserMessage.trim()) {
    return Response.json({ error: "Empty user message" }, { status: 400 });
  }

  const messages: GroqChatMessage[] = [
    { role: "system", content: `${systemPrompt}\n\nFULL TRANSCRIPT:\n${transcript}` },
  ];

  for (const turn of history) {
    messages.push({ role: turn.role, content: turn.content });
  }

  messages.push({ role: "user", content: effectiveUserMessage });

  let lastStatus = 0;
  let lastText = "";
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const upstream = await groqChat(apiKey, {
        model,
        messages,
        stream: true,
        reasoning_effort: "low",
        max_tokens: 2000,
      });

      if (upstream.ok) {
        return new Response(upstream.body, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      }

      lastStatus = upstream.status;
      lastText = await upstream.text();

      if (isRetryableStatus(upstream.status) && attempt < MAX_ATTEMPTS) {
        const retryAfter =
          parseRetryAfterMs(upstream.headers.get("retry-after")) ??
          RETRY_BASE_MS * attempt;
        console.warn(
          `[chat] retry ${attempt}/${MAX_ATTEMPTS - 1} after ${upstream.status}; waiting ${retryAfter}ms`,
        );
        await new Promise((r) => setTimeout(r, retryAfter));
        continue;
      }

      return new Response(friendlyErrorBody(upstream.status, lastText), {
        status: upstream.status,
      });
    } catch (err) {
      lastError = err;
      if (!isTransientError(err) || attempt === MAX_ATTEMPTS) break;
      console.warn(
        `[chat] retry ${attempt}/${MAX_ATTEMPTS - 1} on transient error:`,
        err instanceof Error ? err.message : err,
      );
      await new Promise((r) => setTimeout(r, RETRY_BASE_MS * attempt));
    }
  }

  const message =
    lastError instanceof Error
      ? lastError.message
      : lastText || `Upstream failed with status ${lastStatus || 502}`;
  return new Response(
    `Chat upstream failed after ${MAX_ATTEMPTS} attempts: ${message}`,
    { status: lastStatus && lastStatus !== 0 ? lastStatus : 502 },
  );
}
