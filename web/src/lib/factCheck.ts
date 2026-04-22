/**
 * Server-side fact-check trigger.
 *
 * The original detector overfired on any named product / company mention and
 * kept forcing repeated "TikTok basics" cards across multiple batches.
 *
 * This version is intentionally narrower:
 * - only the last 2 transcript lines are considered actionable foreground
 * - only strong, design-relevant quantitative / bounded claims count
 * - if recent suggestions already covered the same topic, do not force again
 *
 * Production (`/api/suggest/route.ts`) and the eval harness both import this so
 * the measurement path matches the shipped behavior.
 */

interface PreviousSuggestionLite {
  title: string;
  preview: string;
}

const STRONG_FACT_PATTERNS: readonly RegExp[] = [
  /\b\d+(?:\.\d+)?(?:%|k|m|b|K|M|B|ms|MB|GB|TB)?\b/,
  /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|fifteen|thirty|sixty)\s+(?:second|seconds|minute|minutes|hour|hours|day|days|week|weeks|month|months|year|years)\b/i,
  /\b(?:max(?:imum)?|minimum|min|at least|at most|up to|under|over|less than|more than)\b/i,
  /\b(?:latency|uptime|availability|throughput|qps|rps|tps|dau|mau|rpm|tpm|bitrate|resolution|retention)\b/i,
];

const STOPWORDS: ReadonlySet<string> = new Set([
  "a",
  "about",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "do",
  "does",
  "for",
  "from",
  "how",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "kind",
  "like",
  "maybe",
  "of",
  "on",
  "or",
  "part",
  "right",
  "should",
  "so",
  "sort",
  "that",
  "the",
  "their",
  "there",
  "these",
  "they",
  "this",
  "to",
  "up",
  "we",
  "what",
  "when",
  "where",
  "which",
  "with",
  "would",
  "you",
]);

function recentTranscriptLines(transcript: string, count = 2): string[] {
  return transcript
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-count);
}

function normalizeWord(raw: string): string {
  return raw.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
}

function topicTokens(text: string): string[] {
  const cleaned = text
    .replace(/\[(?:YOU|OTHER|\?)\]/g, " ")
    .replace(/["'`]/g, " ");

  const tokens = cleaned
    .split(/\s+/)
    .map(normalizeWord)
    .filter((token) => token.length >= 4 && !STOPWORDS.has(token));

  return Array.from(new Set(tokens));
}

function lineHasStrongFactClaim(line: string): boolean {
  return STRONG_FACT_PATTERNS.some((pattern) => pattern.test(line));
}

function overlapsPriorSuggestion(
  line: string,
  previousSuggestions: PreviousSuggestionLite[],
): boolean {
  const tokens = topicTokens(line);
  if (tokens.length === 0) return false;

  return previousSuggestions.some((suggestion) => {
    const haystack = `${suggestion.title} ${suggestion.preview}`.toLowerCase();
    const overlap = tokens.filter((token) => haystack.includes(token)).length;
    const requiredOverlap = tokens.length >= 3 ? 2 : 1;
    return overlap >= requiredOverlap;
  });
}

export function hasFactualClaim(
  transcript: string,
  previousSuggestions: PreviousSuggestionLite[] = [],
): boolean {
  if (!transcript || transcript.length < 40) return false;

  const recentLines = recentTranscriptLines(transcript, 2);
  if (recentLines.length === 0) return false;

  for (const line of recentLines) {
    if (!lineHasStrongFactClaim(line)) continue;
    if (overlapsPriorSuggestion(line, previousSuggestions)) continue;
    return true;
  }

  return false;
}
