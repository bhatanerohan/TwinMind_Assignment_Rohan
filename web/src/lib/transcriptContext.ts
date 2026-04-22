import type { TranscriptChunk } from "./types";

const RECENT_CONTEXT_SHARE = 0.72;
const MAX_OLDER_SAMPLES = 8;
const MIN_OLDER_SAMPLE_CHARS = 220;
const MAX_OLDER_SAMPLE_CHARS = 700;

interface TranscriptContextOptions {
  includeSpeakerLabels?: boolean;
}

export function buildTranscriptContext(
  chunks: TranscriptChunk[],
  maxChars: number,
  options: TranscriptContextOptions = {},
): string {
  const safeMaxChars = Math.max(0, Math.floor(maxChars));
  if (safeMaxChars === 0 || chunks.length === 0) return "";

  const normalized = chunks
    .map((chunk) => ({
      ...chunk,
      text: stripInlineSpeakerLabel(normalizeSpeech(chunk.text)),
    }))
    .filter((chunk) => chunk.text.length > 0);

  if (normalized.length === 0) return "";

  const sectionReserve = 180;
  const contentBudget = Math.max(0, safeMaxChars - sectionReserve);
  const recentBudget = Math.max(
    Math.floor(contentBudget * RECENT_CONTEXT_SHARE),
    Math.min(contentBudget, 2_400),
  );
  const olderBudget = Math.max(0, contentBudget - recentBudget);

  const recent = pickRecent(normalized, recentBudget, options);
  const olderCandidates = normalized.slice(0, recent.firstIndex);
  const older = pickSparseOlder(olderCandidates, olderBudget, options);

  const withOlder = renderSections(older.pieces, recent.pieces);
  if (withOlder.length <= safeMaxChars) return withOlder;

  const recentOnly = renderSections([], recent.pieces);
  if (recentOnly.length <= safeMaxChars) return recentOnly;

  return recentOnly.slice(-safeMaxChars);
}

export function normalizeSpeech(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function stripInlineSpeakerLabel(text: string): string {
  return text.replace(/^\s*\[(?:YOU|OTHER|\?)\]\s*/i, "").trim();
}

function renderSections(older: string[], recent: string[]): string {
  const sections: string[] = [];
  if (older.length > 0) {
    sections.push(
      `EARLIER_CONTEXT (sampled verbatim excerpts; gaps intentionally omitted):\n${older.join("\n")}`,
    );
  }
  sections.push(
    `RECENT_CONTEXT (dense verbatim transcript; newest last, last 2 entries are foreground):\n${recent.join("\n")}`,
  );
  return sections.join("\n\n");
}

function pickRecent(
  chunks: TranscriptChunk[],
  budget: number,
  options: TranscriptContextOptions,
): { pieces: string[]; firstIndex: number } {
  if (budget <= 0) {
    const last = chunks[chunks.length - 1];
    return {
      pieces: [truncateFromStart(formatChunk(last, options), 500)],
      firstIndex: chunks.length - 1,
    };
  }

  const pieces: string[] = [];
  let used = 0;
  let firstIndex = chunks.length;

  for (let i = chunks.length - 1; i >= 0; i--) {
    const piece = formatChunk(chunks[i], options);
    const separator = pieces.length > 0 ? 1 : 0;
    const remaining = budget - used - separator;

    if (remaining <= 0) break;

    if (piece.length > remaining) {
      if (remaining >= 120) {
        pieces.unshift(truncateFromStart(piece, remaining));
        firstIndex = i;
      }
      break;
    }

    pieces.unshift(piece);
    used += piece.length + separator;
    firstIndex = i;
  }

  return {
    pieces: pieces.length > 0 ? pieces : [formatChunk(chunks[chunks.length - 1], options)],
    firstIndex: Math.min(firstIndex, chunks.length - 1),
  };
}

function pickSparseOlder(
  chunks: TranscriptChunk[],
  budget: number,
  options: TranscriptContextOptions,
): { pieces: string[] } {
  if (chunks.length === 0 || budget < MIN_OLDER_SAMPLE_CHARS) {
    return { pieces: [] };
  }

  const sampleCount = Math.min(
    MAX_OLDER_SAMPLES,
    chunks.length,
    Math.max(1, Math.floor(budget / 450)),
  );
  const perSampleBudget = clamp(
    Math.floor((budget - Math.max(0, sampleCount - 1)) / sampleCount),
    MIN_OLDER_SAMPLE_CHARS,
    MAX_OLDER_SAMPLE_CHARS,
  );

  const indexes = evenlySpacedIndexes(chunks.length, sampleCount);
  const pieces: string[] = [];
  let used = 0;

  for (const index of indexes) {
    const piece = truncateMiddle(formatChunk(chunks[index], options), perSampleBudget);
    const separator = pieces.length > 0 ? 1 : 0;
    if (used + separator + piece.length > budget) break;
    pieces.push(piece);
    used += separator + piece.length;
  }

  return { pieces };
}

function formatChunk(
  chunk: TranscriptChunk,
  options: TranscriptContextOptions,
): string {
  const time = Number.isFinite(chunk.startedAt) ? `[${formatClock(chunk.startedAt)}] ` : "";
  const speaker = options.includeSpeakerLabels ? speakerLabel(chunk) : "";
  return `${time}${speaker}${chunk.text}`;
}

function speakerLabel(chunk: TranscriptChunk): string {
  if (chunk.speaker === "user") return "[YOU] ";
  if (chunk.speaker === "other") return "[OTHER] ";
  return "";
}

function formatClock(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function evenlySpacedIndexes(length: number, count: number): number[] {
  if (count <= 1) return [0];
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    out.push(Math.round((i * (length - 1)) / (count - 1)));
  }
  return Array.from(new Set(out));
}

function truncateFromStart(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  if (maxChars <= 3) return text.slice(-maxChars);
  return `...${text.slice(-(maxChars - 3))}`;
}

function truncateMiddle(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  if (maxChars <= 7) return text.slice(0, maxChars);
  const headChars = Math.ceil((maxChars - 5) * 0.6);
  const tailChars = maxChars - 5 - headChars;
  return `${text.slice(0, headChars)} ... ${text.slice(-tailChars)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
