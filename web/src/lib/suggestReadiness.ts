export const MIN_SUGGEST_TRANSCRIPT_CHARS = 220;

export function stripSpeakerLabels(transcript: string): string {
  return transcript
    .replace(/^\[(?:YOU|OTHER|\?)\]\s*/gm, "")
    .replace(/^\[[0-2]?\d:[0-5]\d:[0-5]\d\]\s*/gm, "")
    .replace(/^EARLIER_CONTEXT\b.*$/gim, "")
    .replace(/^RECENT_CONTEXT\b.*$/gim, "")
    .trim();
}

export function hasEnoughTranscriptForSuggestions(transcript: string): boolean {
  const normalized = stripSpeakerLabels(transcript).replace(/\s+/g, " ").trim();
  return normalized.length >= MIN_SUGGEST_TRANSCRIPT_CHARS;
}
