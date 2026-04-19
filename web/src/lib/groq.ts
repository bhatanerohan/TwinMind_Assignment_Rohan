export const GROQ_BASE = "https://api.groq.com/openai/v1";

export interface GroqChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function groqChat(
  apiKey: string,
  body: {
    model: string;
    messages: GroqChatMessage[];
    max_tokens?: number;
    temperature?: number;
    reasoning_effort?: "low" | "medium" | "high";
    stream?: boolean;
    response_format?: { type: "json_object" };
  },
): Promise<Response> {
  return fetch(`${GROQ_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
}

export async function groqTranscribe(
  apiKey: string,
  file: File | Blob,
  filename: string,
  model: string,
): Promise<Response> {
  const form = new FormData();
  form.append("file", file, filename);
  form.append("model", model);
  return fetch(`${GROQ_BASE}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    cache: "no-store",
  });
}

export function readApiKeyFromRequest(request: Request): string | null {
  const key = request.headers.get("x-groq-key");
  if (!key || !key.startsWith("gsk_")) return null;
  return key;
}
