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

const NUMERIC_CLAIM_PATTERN =
  /\b(?:\d+(?:\.\d+)?(?:%|k|m|b|K|M|B|ms|MB|GB|TB)?|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|thirty|sixty)\b/i;

const DECISION_METRIC_PATTERN =
  /\b(?:price|pricing|cost|budget|seat|seats|base|salary|equity|bonus|band|level|sla|uptime|availability|latency|p50|p95|p99|throughput|qps|rps|tps|dau|mau|rpm|tpm|bitrate|resolution|retention|drop-off|conversion|limit|cap|maximum|max|min|minimum|under|over|before|after|within|deadline|region|regions|compliance|residency)\b/i;

const BOUNDED_CLAIM_PATTERN =
  /\b(?:tops out|lands? between|range is|band is|fixed per|must be|has to|only supports?|guarantees?|commits? to|requires?|allows?|blocks?|limited to|up to|at least|at most|no more than|less than|more than)\b/i;

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
  const hasNumericClaim = NUMERIC_CLAIM_PATTERN.test(line);
  const hasDecisionMetric = DECISION_METRIC_PATTERN.test(line);
  const hasBoundedClaim = BOUNDED_CLAIM_PATTERN.test(line);

  return hasNumericClaim && (hasDecisionMetric || hasBoundedClaim);
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
