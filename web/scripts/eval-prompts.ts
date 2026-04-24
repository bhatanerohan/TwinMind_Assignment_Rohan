/**
 * scripts/eval-prompts.ts
 *
 * Offline evaluation harness for the TwinMind suggestion prompt.
 *
 * Runs the current shipped prompt (from src/lib/prompt-versions/index.ts) against
 * 5 synthetic transcripts × 3 refresh cycles = 15 batches = 45 suggestions. Each
 * suggestion is scored by a meta-judge on 5 per-suggestion criteria + 1 per-batch
 * variety criterion (0–3 each). Writes a markdown report to scripts/eval-reports/.
 *
 * Run:
 *   cd web
 *   GROQ_API_KEY=gsk_... npm run eval     (or rely on ../scripts/.env)
 *
 * The harness mirrors our production /api/suggest prompt construction and uses
 * original synthetic scenarios that exercise sales, interview, technical,
 * negotiation, and planning conversations.
 *
 * Judge model defaults to the same Groq-hosted model as generation so the eval
 * remains cheap and easy to reproduce.
 */

import { loadEnv } from "./load-env";
loadEnv();

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_SUGGEST_PROMPT,
  CURRENT_SUGGESTION_VERSION,
} from "../src/lib/prompt-versions";
import type {
  MeetingType,
  Suggestion,
  SuggestionKind,
  TranscriptChunk,
  UserRole,
} from "../src/lib/types";
import { hasFactualClaim } from "../src/lib/factCheck";
import { buildTranscriptContext, stripInlineSpeakerLabel } from "../src/lib/transcriptContext";
import { ALL_TRANSCRIPTS, type EvalTranscript } from "./fixtures/transcripts";

const TARGET_MODEL = "openai/gpt-oss-120b";
const META_MODEL = "openai/gpt-oss-120b";
const GROQ_BASE = "https://api.groq.com/openai/v1";

const apiKey = process.env.GROQ_API_KEY;
if (!apiKey) {
  console.error("Missing GROQ_API_KEY environment variable. Aborting.");
  process.exit(1);
}

const VALID_KINDS: ReadonlySet<SuggestionKind> = new Set([
  "question",
  "answer",
  "fact-check",
  "talking-point",
  "clarify",
]);

function stripActionPrefix(value: string): string {
  const cleaned = value
    .replace(/^(ask|say|verify|raise|clarify|bring up)\s*[:\-]\s*/i, "")
    .trim();
  return cleaned.length > 0 ? cleaned : value.trim();
}

interface Criterion {
  key: string;
  label: string;
  description: string;
}

const CRITERIA: Criterion[] = [
  {
    key: "specificity",
    label: "Specificity",
    description:
      "Are the suggestions grounded in specific words from the transcript, or could they apply to any conversation? 0=generic, 1=vaguely relevant, 2=clearly triggered by transcript, 3=quotes specific phrase from transcript.",
  },
  {
    key: "actionability",
    label: "Actionability",
    description:
      "Can the user act on this in the next 30 seconds? 0=no clear action, 1=vague action, 2=clear action, 3=specific words or steps given.",
  },
  {
    key: "previewQuality",
    label: "Preview quality",
    description:
      "Does the preview deliver value without clicking? 0=could be anything, 1=vaguely useful, 2=clearly useful, 3=immediately actionable standalone.",
  },
  {
    key: "timingFit",
    label: "Timing fit",
    description:
      "Does the suggestion fit WHAT IS HAPPENING NOW in the transcript? 0=no connection to recent content, 1=loosely connected, 2=clearly connected, 3=directly addresses the most recent exchange.",
  },
  {
    key: "meetingTypeFit",
    label: "Meeting-type calibration",
    description:
      "Are the suggestion kinds appropriate for this meeting type? 0=wrong kinds for context, 1=neutral/generic kinds, 2=appropriate kinds, 3=optimal kinds for the exact situation.",
  },
];

interface GeneratedSuggestion {
  kind: SuggestionKind;
  title: string;
  preview: string;
}

interface ScoredSuggestion {
  suggestion: GeneratedSuggestion;
  scores: Record<string, { score: number; reason: string }>;
  perSuggestionTotal: number;
}

interface ScoredBatch {
  transcriptId: string;
  transcriptLabel: string;
  meetingType: MeetingType;
  userRole: UserRole;
  cycle: number;
  suggestions: ScoredSuggestion[];
  varietyScore: { score: number; reason: string };
  batchTotal: number;
}

// ---------- Groq client ----------

interface GroqChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface GroqChatBody {
  model: string;
  messages: GroqChatMessage[];
  max_tokens?: number;
  temperature?: number;
  reasoning_effort?: "low" | "medium" | "high";
  response_format?: { type: "json_object" };
}

async function groqChat(body: GroqChatBody): Promise<Response> {
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

// ---------- Prompt construction (mirrors /api/suggest/route.ts) ----------

function renderPrevious(prev: Suggestion[]): string {
  if (prev.length === 0) return "(none yet)";
  return prev
    .slice(-6)
    .map((s) => `- ${s.title}: ${s.preview}`)
    .join("\n");
}

function windowTranscript(chunks: string[], window: number): string {
  const baseTime = Date.UTC(2026, 0, 1, 9, 0, 0);
  const selected = chunks.slice(-window);
  const transcriptChunks: TranscriptChunk[] = selected.map((text, index) => ({
    id: `eval-${index}`,
    text: stripInlineSpeakerLabel(text),
    startedAt: baseTime + index * 30_000,
    endedAt: baseTime + (index + 1) * 30_000,
  }));
  return buildTranscriptContext(transcriptChunks, 6_000);
}

function roleHintText(userRole: UserRole): string {
  switch (userRole) {
    case "host":
      return "USER_ROLE: host - the user is leading (interviewer, seller, facilitator). Bias suggestions toward probing questions and reacting to the other side's answers.";
    case "guest":
      return "USER_ROLE: guest - the user is responding (candidate, prospect, customer). Bias suggestions toward answers the user might give and counter-questions the user could ask.";
    case "observer":
      return "USER_ROLE: observer - the user is listening in on others' conversation. Frame suggestions as analytical commentary, not as things for the user to say.";
    case "unknown":
    default:
      return "USER_ROLE: unknown - frame suggestions neutrally; avoid assuming whether the user is asking or answering.";
  }
}

function buildUserContent(
  meetingType: MeetingType,
  userRole: UserRole,
  transcriptText: string,
  prev: Suggestion[],
): string {
  const previousBlock = renderPrevious(prev);
  const factCheckHint = hasFactualClaim(transcriptText, prev)
    ? `FACTUAL_CLAIMS_DETECTED: yes. A "fact-check" card is MANDATORY — one of your 3 suggestions MUST have kind="fact-check" and quote the specific claim from the transcript.\n\n`
    : "";
  return (
    `MEETING_TYPE: ${meetingType}\n` +
    `${roleHintText(userRole)}\n\n` +
    `${factCheckHint}` +
    `TRANSCRIPT_CONTEXT (dense recent transcript plus sparse older excerpts; speaker labels may be omitted):\n${transcriptText}\n\n` +
    `PREVIOUSLY_SHOWN_SUGGESTIONS (do not repeat or near-repeat these):\n${previousBlock}\n\n` +
    `Return exactly 3 suggestions as strict JSON matching the schema.`
  );
}

// ---------- Generator call ----------

async function callSuggestionsOnce(
  userContent: string,
  attempt: 1 | 2,
): Promise<GeneratedSuggestion[]> {
  const retrySuffix =
    "\n\nPREVIOUS ATTEMPT FAILED JSON VALIDATION. Return ONLY a valid JSON object with exactly 3 suggestions. No prose, no markdown.";
  const res = await groqChat({
    model: TARGET_MODEL,
    messages: [
      { role: "system", content: DEFAULT_SUGGEST_PROMPT },
      { role: "user", content: attempt === 1 ? userContent : userContent + retrySuffix },
    ],
    response_format: { type: "json_object" },
    reasoning_effort: "low",
    temperature: attempt === 1 ? 0.4 : 0.2,
    max_tokens: 2000,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Groq ${res.status}: ${body.slice(0, 200)}`);
  }

  const raw = (await res.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const content = raw.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("json_validate_failed: no content string");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    throw new Error(`json_parse_failed: ${(e as Error).message.slice(0, 120)}`);
  }

  const candidate = (parsed as { suggestions?: unknown }).suggestions;
  if (!Array.isArray(candidate) || candidate.length !== 3) {
    throw new Error("json_validate_failed: suggestions array missing or wrong length");
  }

  const out: GeneratedSuggestion[] = [];
  for (const item of candidate) {
    if (!item || typeof item !== "object") {
      throw new Error("json_validate_failed: suggestion is not an object");
    }
    const rec = item as { kind?: unknown; title?: unknown; preview?: unknown };
    if (typeof rec.kind !== "string" || !VALID_KINDS.has(rec.kind as SuggestionKind)) {
      throw new Error(`json_validate_failed: bad kind ${String(rec.kind)}`);
    }
    if (typeof rec.title !== "string" || !rec.title.trim()) {
      throw new Error("json_validate_failed: title missing or empty");
    }
    if (typeof rec.preview !== "string" || !rec.preview.trim()) {
      throw new Error("json_validate_failed: preview missing or empty");
    }
    out.push({
      kind: rec.kind as SuggestionKind,
      title: stripActionPrefix(rec.title),
      preview: stripActionPrefix(rec.preview),
    });
  }
  return out;
}

async function callSuggestions(
  meetingType: MeetingType,
  userRole: UserRole,
  transcriptText: string,
  prev: Suggestion[],
): Promise<GeneratedSuggestion[]> {
  const userContent = buildUserContent(meetingType, userRole, transcriptText, prev);
  try {
    return await callSuggestionsOnce(userContent, 1);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const lower = msg.toLowerCase();
    if (
      lower.includes("json") ||
      lower.includes("validat") ||
      lower.includes("parse") ||
      lower.includes("schema")
    ) {
      console.warn(`[eval] retrying after JSON failure: ${msg.slice(0, 120)}`);
      return await callSuggestionsOnce(userContent, 2);
    }
    throw err;
  }
}

// ---------- Judge calls ----------

interface ScoreObject {
  score: number;
  reason: string;
}

function parseScoreResponse(content: string): ScoreObject {
  const parsed = JSON.parse(content);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("judge: response not an object");
  }
  const rec = parsed as { score?: unknown; reason?: unknown };
  if (typeof rec.score !== "number" || !Number.isFinite(rec.score)) {
    throw new Error("judge: score missing or non-numeric");
  }
  const s = Math.max(0, Math.min(3, Math.round(rec.score)));
  const reason = typeof rec.reason === "string" ? rec.reason : "";
  return { score: s, reason };
}

async function judgeCall(judgePrompt: string): Promise<ScoreObject> {
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await groqChat({
      model: META_MODEL,
      messages: [
        { role: "system", content: "You are a strict, terse judge. Return only the requested JSON object." },
        { role: "user", content: judgePrompt },
      ],
      response_format: { type: "json_object" },
      reasoning_effort: "low",
      temperature: 0.0,
      max_tokens: 400,
    });
    if (res.ok) {
      const raw = (await res.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>;
      };
      const content = raw.choices?.[0]?.message?.content;
      if (typeof content !== "string") {
        throw new Error("judge: no content string");
      }
      return parseScoreResponse(content);
    }
    const body = await res.text();
    if (res.status === 429 && attempt < MAX_ATTEMPTS) {
      const waitMs = 62_000;
      console.warn(`[eval] judge 429; waiting ${waitMs / 1000}s (attempt ${attempt}/${MAX_ATTEMPTS - 1})`);
      await sleep(waitMs);
      continue;
    }
    throw new Error(`Groq judge ${res.status}: ${body.slice(0, 200)}`);
  }
  throw new Error("judge: retries exhausted");
}

async function scoreCriterion(
  transcript: EvalTranscript,
  transcriptText: string,
  suggestion: GeneratedSuggestion,
  criterion: Criterion,
): Promise<ScoreObject> {
  const judgePrompt = `You are evaluating the quality of a live meeting suggestion. Score the following on a scale of 0-3.

Meeting type: ${transcript.meetingType}
User role: ${transcript.userRole}

Meeting transcript context:
${transcriptText}

Suggestion being evaluated:
Kind: ${suggestion.kind}
Title: ${suggestion.title}
Preview: ${suggestion.preview}

Score criterion: ${criterion.description}

Respond with ONLY a JSON object: {"score": 0-3, "reason": "one sentence explanation"}`;
  return judgeCall(judgePrompt);
}

async function scoreVariety(
  transcript: EvalTranscript,
  transcriptText: string,
  suggestions: GeneratedSuggestion[],
  previousBatch: Suggestion[],
): Promise<ScoreObject> {
  const prevRendered =
    previousBatch.length === 0
      ? "(no previous batch)"
      : previousBatch.map((s) => `- [${s.kind}] ${s.title}: ${s.preview}`).join("\n");

  const judgePrompt = `Score the VARIETY of a batch of 3 live meeting suggestions on a scale of 0-3.

Meeting type: ${transcript.meetingType}
User role: ${transcript.userRole}

Meeting transcript:
${transcriptText}

Previous batch:
${prevRendered}

Current batch:
${suggestions
  .map((s, i) => `${i + 1}. [${s.kind}] ${s.title}: ${s.preview}`)
  .join("\n")}

Criterion: Are all 3 suggestions different from each other AND from the previous batch?
0 = repeats across batches, 1 = some overlap, 2 = different kinds but similar themes, 3 = diverse kinds and diverse themes.

Respond with ONLY a JSON object: {"score": 0-3, "reason": "one sentence explanation"}`;
  return judgeCall(judgePrompt);
}

// ---------- Cycle runner ----------

const JUDGE_PAUSE_MS = 4_000;

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function runCycle(
  transcript: EvalTranscript,
  cycle: number,
  prev: Suggestion[],
): Promise<{ scored: ScoredBatch; nextPrev: Suggestion[] }> {
  const windowSize = Math.min(transcript.chunks.length, 4 + cycle * 2);
  const transcriptText = windowTranscript(transcript.chunks, windowSize);

  const generated = await callSuggestions(
    transcript.meetingType,
    transcript.userRole,
    transcriptText,
    prev,
  );
  await sleep(JUDGE_PAUSE_MS);

  const scored: ScoredSuggestion[] = [];
  for (const s of generated) {
    const scores: Record<string, ScoreObject> = {};
    for (const c of CRITERIA) {
      scores[c.key] = await scoreCriterion(transcript, transcriptText, s, c);
      await sleep(JUDGE_PAUSE_MS);
    }
    const perSuggestionTotal = Object.values(scores).reduce(
      (sum, x) => sum + x.score,
      0,
    );
    scored.push({ suggestion: s, scores, perSuggestionTotal });
  }

  const previousBatchOnly = prev.slice(-3);
  const varietyScore = await scoreVariety(
    transcript,
    transcriptText,
    generated,
    previousBatchOnly,
  );

  // Batch total: sum of per-criterion averages × 3 + variety → /18
  const avgPerCriterion = CRITERIA.reduce((acc, c) => {
    const avg =
      scored.reduce((sum, s) => sum + s.scores[c.key].score, 0) / scored.length;
    return acc + avg;
  }, 0);
  const batchTotal = Math.round((avgPerCriterion + varietyScore.score) * 10) / 10;

  const asSuggestions: Suggestion[] = generated.map((s) => ({
    id: `eval-${transcript.id}-${cycle}-${crypto.randomUUID().slice(0, 8)}`,
    kind: s.kind,
    title: s.title,
    preview: s.preview,
  }));

  return {
    scored: {
      transcriptId: transcript.id,
      transcriptLabel: transcript.label,
      meetingType: transcript.meetingType,
      userRole: transcript.userRole,
      cycle,
      suggestions: scored,
      varietyScore,
      batchTotal,
    },
    nextPrev: [...prev, ...asSuggestions],
  };
}

// ---------- Reporting ----------

function buildReport(batches: ScoredBatch[]): string {
  const lines: string[] = [];
  const timestamp = new Date().toISOString();

  lines.push(`## TwinMind Suggestion Quality Report`);
  lines.push(`Prompt version: ${CURRENT_SUGGESTION_VERSION}`);
  lines.push(`Generated: ${timestamp}`);
  lines.push(`Target model: ${TARGET_MODEL}`);
  lines.push(`Meta-judge: ${META_MODEL}`);
  lines.push("");

  const totalBatches = batches.length;
  const totalSuggestions = batches.reduce((n, b) => n + b.suggestions.length, 0);

  const perCriterionTotals: Record<string, number> = {};
  for (const c of CRITERIA) perCriterionTotals[c.key] = 0;
  let varietyTotal = 0;
  const kindCounts: Record<string, number> = {
    question: 0,
    answer: 0,
    "fact-check": 0,
    "talking-point": 0,
    clarify: 0,
  };

  for (const b of batches) {
    for (const s of b.suggestions) {
      for (const c of CRITERIA) {
        perCriterionTotals[c.key] += s.scores[c.key].score;
      }
      kindCounts[s.suggestion.kind] = (kindCounts[s.suggestion.kind] ?? 0) + 1;
    }
    varietyTotal += b.varietyScore.score;
  }

  lines.push(`### Summary Scores (avg across all transcripts and cycles)`);
  lines.push("");
  lines.push(`| Criterion                | Avg score | / 3 |`);
  lines.push(`| ------------------------ | --------- | --- |`);
  for (const c of CRITERIA) {
    const avg = perCriterionTotals[c.key] / totalSuggestions;
    lines.push(`| ${c.label.padEnd(24)} | ${avg.toFixed(2).padStart(9)} | 3   |`);
  }
  lines.push(
    `| ${"Variety (per batch)".padEnd(24)} | ${(varietyTotal / totalBatches)
      .toFixed(2)
      .padStart(9)} | 3   |`,
  );
  const totalAvg = batches.reduce((n, b) => n + b.batchTotal, 0) / totalBatches;
  lines.push(
    `| ${"BATCH TOTAL".padEnd(24)} | ${totalAvg.toFixed(2).padStart(9)} | 18  |`,
  );
  lines.push("");

  // Kind distribution helps catch over-reliance on one card type.
  lines.push(`### Kind Distribution (${totalSuggestions} total cards)`);
  lines.push("");
  lines.push(`| Kind | Count | % |`);
  lines.push(`| ---- | ----- | - |`);
  for (const k of ["question", "answer", "fact-check", "talking-point", "clarify"] as const) {
    const n = kindCounts[k] ?? 0;
    const pct = ((n / totalSuggestions) * 100).toFixed(1);
    lines.push(`| ${k.padEnd(13)} | ${String(n).padStart(5)} | ${pct.padStart(5)}% |`);
  }
  lines.push("");

  // Per-transcript
  lines.push(`### Per-Meeting Results`);
  const byTranscript = new Map<string, ScoredBatch[]>();
  for (const b of batches) {
    if (!byTranscript.has(b.transcriptLabel)) byTranscript.set(b.transcriptLabel, []);
    byTranscript.get(b.transcriptLabel)!.push(b);
  }
  for (const [label, rows] of byTranscript) {
    lines.push("");
    lines.push(`#### ${label}`);
    for (const b of rows) {
      lines.push(`Cycle ${b.cycle} — batch total: **${b.batchTotal.toFixed(1)} / 18**`);
      for (const s of b.suggestions) {
        lines.push(
          `  - [${s.suggestion.kind}] "${s.suggestion.title}" → ${s.perSuggestionTotal}/15`,
        );
      }
      lines.push(`  - variety: ${b.varietyScore.score}/3 — ${b.varietyScore.reason}`);
    }
  }
  lines.push("");

  // Weakest suggestions
  const allScored: Array<ScoredSuggestion & { meta: ScoredBatch }> = [];
  for (const b of batches) {
    for (const s of b.suggestions) {
      allScored.push({ ...s, meta: b });
    }
  }
  const weak = allScored
    .filter((s) => s.perSuggestionTotal < 10)
    .sort((a, b) => a.perSuggestionTotal - b.perSuggestionTotal);

  lines.push(`### Weakest Suggestions (per-suggestion score < 10 / 15)`);
  if (weak.length === 0) {
    lines.push("None — every suggestion scored ≥ 10.");
  } else {
    for (const s of weak) {
      lines.push("");
      lines.push(
        `- ${s.meta.transcriptLabel} / Cycle ${s.meta.cycle} — [${s.suggestion.kind}] ${s.perSuggestionTotal}/15`,
      );
      lines.push(`  Title: ${s.suggestion.title}`);
      lines.push(`  Preview: ${s.suggestion.preview}`);
      for (const c of CRITERIA) {
        const sc = s.scores[c.key];
        lines.push(`  - ${c.label}: ${sc.score}/3 — ${sc.reason}`);
      }
    }
  }
  lines.push("");

  // Recommendations
  lines.push(`### Recommendations`);
  for (const c of CRITERIA) {
    const avg = perCriterionTotals[c.key] / totalSuggestions;
    if (avg < 2.0) {
      lines.push(
        `- ${c.label} avg is ${avg.toFixed(2)}. Consider tightening the prompt section that drives this criterion.`,
      );
    }
  }
  if (varietyTotal / totalBatches < 2.0) {
    lines.push(
      `- Variety avg is ${(varietyTotal / totalBatches).toFixed(2)}. Strengthen the diversity enforcement rule.`,
    );
  }
  if ((kindCounts["fact-check"] ?? 0) === 0) {
    lines.push(
      `- 0 fact-check cards across ${totalSuggestions} suggestions. Rule 2 is not firing. Consider server-side FACTUAL_CLAIMS_DETECTED injection.`,
    );
  }
  if (totalAvg >= 15) {
    lines.push(`- Overall score is strong (${totalAvg.toFixed(2)} / 18). No urgent changes indicated.`);
  }
  lines.push("");

  return lines.join("\n");
}

// ---------- Main ----------

async function main(): Promise<void> {
  const quick = process.argv.includes("--quick") || process.env.EVAL_QUICK === "1";
  // Quick mode: 2 transcripts × 2 cycles = 4 batches (~5 min) vs full 5×3=15 (~20 min).
  // Picks sales + technical — covers fact-check detection + varied meeting types.
  const transcripts = quick
    ? ALL_TRANSCRIPTS.filter((t) => t.id === "sales" || t.id === "technical")
    : ALL_TRANSCRIPTS;
  const maxCycles = quick ? 2 : 3;

  console.log(
    `[eval] prompt version ${CURRENT_SUGGESTION_VERSION} — target ${TARGET_MODEL}, judge ${META_MODEL}${quick ? " [QUICK MODE]" : ""}`,
  );
  console.log(`[eval] ${transcripts.length} transcript(s) × ${maxCycles} cycle(s) = ${transcripts.length * maxCycles} batches`);
  const scoredBatches: ScoredBatch[] = [];

  const CYCLE_PAUSE_MS = 15_000;

  for (const t of transcripts) {
    console.log(`\n[eval] === ${t.label} (${t.meetingType} / role=${t.userRole}) ===`);
    let prev: Suggestion[] = [];
    for (let cycle = 1; cycle <= maxCycles; cycle++) {
      console.log(`[eval] ${t.label} cycle ${cycle}`);
      try {
        const { scored, nextPrev } = await runCycle(t, cycle, prev);
        scoredBatches.push(scored);
        prev = nextPrev;
        console.log(`[eval]   batch total ${scored.batchTotal.toFixed(1)} / 18`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[eval] cycle failed: ${msg.slice(0, 300)}`);
        if (msg.toLowerCase().includes("rate limit") || msg.includes("429")) {
          console.warn("[eval] rate-limit backoff 60s");
          await sleep(60_000);
        }
      }
      await sleep(CYCLE_PAUSE_MS);
    }
  }

  const report = buildReport(scoredBatches);

  const here = dirname(fileURLToPath(import.meta.url));
  const reportsDir = join(here, "eval-reports");
  mkdirSync(reportsDir, { recursive: true });
  const isoSafe = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = join(reportsDir, `eval-report-${isoSafe}.md`);
  writeFileSync(outPath, report, "utf8");

  console.log("\n" + report);
  console.log(`\n[eval] report saved → ${outPath}`);
}

main().catch((err) => {
  console.error("[eval] fatal:", err);
  process.exit(1);
});
