import {
  useSession,
  useSettings,
} from "@/lib/store";
import { buildTranscriptContext } from "@/lib/transcriptContext";
import type { Suggestion } from "@/lib/types";

const MAX_CHAT_HISTORY_TURNS = 10;
const MAX_CHAT_HISTORY_CHARS = 6_000;

type ChatHistoryTurn = {
  role: "user" | "assistant";
  content: string;
};

export async function* streamChatReply(
  userMessage: string,
  fromSuggestion?: Suggestion,
): AsyncGenerator<string> {
  const { settings } = useSettings.getState();
  if (!settings.apiKey) {
    throw new Error("API key not set");
  }

  const session = useSession.getState();
  const contextChars = fromSuggestion
    ? settings.detailContextChars
    : settings.chatContextChars;
  const transcript = buildTranscriptContext(session.transcript, contextChars);
  const systemPrompt = fromSuggestion
    ? settings.detailPrompt
    : settings.chatPrompt;

  // Caller adds the user message + an empty assistant placeholder to the store
  // before invoking this generator, so drop the last two entries for history.
  const history = buildRecentChatHistory(
    session.chat.slice(0, -2).map((m) => ({
      role: m.role,
      content: m.content,
    })),
  );

  const res = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-groq-key": settings.apiKey,
    },
    body: JSON.stringify({
      transcript,
      systemPrompt,
      history,
      userMessage,
      model: settings.chatModel,
      fromSuggestion: fromSuggestion
        ? { title: fromSuggestion.title, preview: fromSuggestion.preview }
        : undefined,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    const err = new Error(body || `Chat failed (${res.status})`) as Error & {
      status?: number;
    };
    err.status = res.status;
    throw err;
  }
  if (!res.body) {
    throw new Error("Chat response has no body");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let sepIdx: number;
      while (
        (sepIdx = indexOfEventBoundary(buffer)) !== -1
      ) {
        const rawEvent = buffer.slice(0, sepIdx);
        buffer = buffer.slice(sepIdx).replace(/^(\r?\n){1,2}/, "");

        const dataLines: string[] = [];
        for (const line of rawEvent.split(/\r?\n/)) {
          if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).trimStart());
          }
        }
        if (dataLines.length === 0) continue;
        const payload = dataLines.join("\n");
        if (payload === "[DONE]") return;

        try {
          const parsed = JSON.parse(payload) as {
            choices?: Array<{
              delta?: { content?: unknown };
              finish_reason?: unknown;
            }>;
          };
          const choice = parsed.choices?.[0];
          const content = choice?.delta?.content;
          if (typeof content === "string" && content.length > 0) {
            yield content;
          }
          if (choice?.finish_reason === "length") {
            yield '\n\n_[Output stopped because it hit the model response length limit. Ask "continue" to finish.]_';
            return;
          }
        } catch {
          // skip malformed event
        }
      }
    }

    const tail = buffer.trim();
    if (tail.length > 0) {
      for (const line of tail.split(/\r?\n/)) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trimStart();
        if (payload === "[DONE]") return;
        try {
          const parsed = JSON.parse(payload) as {
            choices?: Array<{
              delta?: { content?: unknown };
              finish_reason?: unknown;
            }>;
          };
          const choice = parsed.choices?.[0];
          const content = choice?.delta?.content;
          if (typeof content === "string" && content.length > 0) {
            yield content;
          }
          if (choice?.finish_reason === "length") {
            yield '\n\n_[Output stopped because it hit the model response length limit. Ask "continue" to finish.]_';
            return;
          }
        } catch {
          // ignore
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }
}

function buildRecentChatHistory(history: ChatHistoryTurn[]): ChatHistoryTurn[] {
  const recent = history
    .filter((turn) => turn.content.trim().length > 0)
    .slice(-MAX_CHAT_HISTORY_TURNS);

  const selected: ChatHistoryTurn[] = [];
  let used = 0;

  for (let i = recent.length - 1; i >= 0; i--) {
    const turn = recent[i];
    const remaining = MAX_CHAT_HISTORY_CHARS - used;
    if (remaining <= 0) break;

    const content =
      turn.content.length > remaining
        ? truncateFromStart(turn.content, remaining)
        : turn.content;

    selected.unshift({
      role: turn.role,
      content,
    });
    used += content.length;
  }

  return selected;
}

function truncateFromStart(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  if (maxChars <= 3) return text.slice(-maxChars);
  return `...${text.slice(-(maxChars - 3))}`;
}

export function formatChatError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const trimmed = raw.trim().slice(0, 240);
  if (/rate.?limit|429/i.test(raw)) {
    return `_⚠️ Rate limit hit (Groq free tier is 8K TPM). Wait ~30s and retry, or upgrade to Dev tier._`;
  }
  if (/fetch failed|econnreset|etimedout|socket/i.test(raw)) {
    return `_⚠️ Network error reaching Groq. Check connection and retry._`;
  }
  if (/5\d{2}/.test(raw)) {
    return `_⚠️ Groq upstream error. Retry in a moment._\n\n\`${trimmed}\``;
  }
  return `_⚠️ Failed to generate reply:_ \`${trimmed || "unknown error"}\``;
}

function indexOfEventBoundary(buf: string): number {
  const a = buf.indexOf("\n\n");
  const b = buf.indexOf("\r\n\r\n");
  if (a === -1) return b;
  if (b === -1) return a;
  return Math.min(a, b);
}
