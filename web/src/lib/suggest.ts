import { useSession, useSettings } from "@/lib/store";
import { hasEnoughTranscriptForSuggestions } from "@/lib/suggestReadiness";
import { buildTranscriptContext } from "@/lib/transcriptContext";
import type { MeetingType, Suggestion, SuggestionBatch } from "@/lib/types";

const MAX_PREVIOUS_ITEMS = 15;

interface SuggestResponse {
  suggestions: Suggestion[];
  meetingType?: MeetingType;
  meetingTypeConfidence?: number;
  meetingTypeRationale?: string;
}

export async function fetchSuggestions(): Promise<SuggestionBatch | null> {
  const { settings } = useSettings.getState();
  if (!settings.apiKey) {
    throw new Error("API key not set");
  }

  const session = useSession.getState();
  const transcript = buildTranscriptContext(
    session.transcript,
    settings.suggestContextChars,
  );

  if (!hasEnoughTranscriptForSuggestions(transcript)) {
    return null;
  }

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
    }),
  });

  if (res.status === 422) {
    return null;
  }

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
