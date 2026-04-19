import { useSession, useSettings } from "@/lib/store";
import type { MeetingType, Suggestion, SuggestionBatch, TranscriptChunk } from "@/lib/types";

const MAX_PREVIOUS_ITEMS = 15;

function buildLabeledTranscript(
  chunks: TranscriptChunk[],
  maxChars: number,
): string {
  const parts: string[] = [];
  let used = 0;
  for (let i = chunks.length - 1; i >= 0; i--) {
    const c = chunks[i];
    const label =
      c.speaker === "user" ? "[YOU]" : c.speaker === "other" ? "[OTHER]" : "[?]";
    const piece = `${label} ${c.text}`;
    if (used + piece.length > maxChars) {
      parts.unshift(piece.slice(-Math.max(0, maxChars - used)));
      break;
    }
    parts.unshift(piece);
    used += piece.length + 1;
  }
  return parts.join("\n");
}

interface SuggestResponse {
  suggestions: Suggestion[];
  meetingType?: MeetingType;
  meetingTypeConfidence?: number;
  meetingTypeRationale?: string;
}

export async function fetchSuggestions(): Promise<SuggestionBatch> {
  const { settings } = useSettings.getState();
  if (!settings.apiKey) {
    throw new Error("API key not set");
  }

  const session = useSession.getState();
  const transcript = buildLabeledTranscript(
    session.transcript,
    settings.suggestContextChars,
  );

  const previousSuggestions = session.batches
    .slice(0, 3)
    .flatMap((b) => b.suggestions)
    .slice(0, MAX_PREVIOUS_ITEMS)
    .map((s) => ({ title: s.title, preview: s.preview }));

  const currentMeetingType = session.sessionMeta.meetingType;

  const res = await fetch("/api/suggest", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-groq-key": settings.apiKey,
    },
    body: JSON.stringify({
      transcript,
      systemPrompt: settings.suggestPrompt,
      previousSuggestions,
      model: settings.chatModel,
      meetingType: currentMeetingType,
      userRole: settings.userRole,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Suggest failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as SuggestResponse;

  if (
    data.meetingType &&
    (data.meetingType !== currentMeetingType || currentMeetingType === "unknown")
  ) {
    useSession.getState().setSessionMeta({
      meetingType: data.meetingType,
      meetingTypeConfidence: data.meetingTypeConfidence ?? 0,
      meetingTypeRationale: data.meetingTypeRationale ?? "",
      classifiedAt: Date.now(),
    });
  }

  return {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    suggestions: data.suggestions,
  };
}
