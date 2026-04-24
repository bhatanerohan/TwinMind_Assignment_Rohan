# Suggestion prompt — version history

Every version lives in its own `vN.ts`. The shipped version is selected by
`./index.ts` (`DEFAULT_SUGGEST_PROMPT` + `CURRENT_SUGGESTION_VERSION`).

## Score history

Scores are produced by `npm run eval` (see `web/scripts/eval-prompts.ts`).
Each run evaluates 5 transcripts × 3 cycles = 15 batches = 45 suggestions
against 6 criteria (5 per-suggestion + 1 per-batch variety). Judge model:
`openai/gpt-oss-120b` (same as target; accepts judge-is-generator bias risk
for infrastructure simplicity).

Note: eval fixtures were replaced with original project-specific scenarios after
the v3 dense/sparse context run, so older rows are useful for direction but are
not strict apples-to-apples baselines for future runs.

| Version | Mode | Total / 18 | Specificity | Actionability | Preview | Timing | Meeting-type | Variety | Fact-check % | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| v1.0.0 | quick (4 batches) | 13.93 | 2.83 | 1.50 ⚠️ | 2.33 | 2.42 | 2.58 | 2.25 | 33.3% ✓ | 2026-04-20T01:08Z. Baseline. Fact-check rate is from server-side injection (not the prompt) — same on v2. |
| v2.0.0 | quick (4 batches) | **14.50** | 2.58 | 1.67 ⚠️ | 2.42 | 2.67 | **2.92** ⭐ | 2.25 | 33.3% ✓ | 2026-04-20T00:52Z. v2 beats v1 by +0.57 total. Wins on timing/meeting-type/actionability/preview. Loses on specificity (-0.25, may be variance — 4 batches is wide). |
| v1 vs v2 Δ | quick | **+0.57** | -0.25 ⚠️ | +0.17 | +0.09 | +0.25 | +0.34 | 0 | 0 | v2 wins overall but specificity regression needs full-run confirmation (TPD-blocked). |

## Version changelog

### v1.0.0 — baseline
- STEP 1 silent assessment (depth / covered / factual claims / question-asked-of-you)
- STEP 2 with 7 hard routing rules
- Preview-value-standalone rule
- Manual-audit issues (pre-eval): 0% fact-checks, ~25% premature, ~5 re-raises per session

### v2.0.0 — stacked fixes from manual audit + known issues
Changes vs v1.0.0:
1. **FOREGROUND RULE** (new routing rule 8): trigger quote MUST come from the last 2 chunks.
2. **ALGORITHMIC VARIETY** (replaces soft "≥2 distinct kinds"): "at MOST 1 of your 3 kinds may appear in PREV_KINDS."
3. **PREVIEW-MUST-QUOTE** (added to PREVIEW QUALITY): every preview must reference a specific noun/number/short-quote from foreground.

Paired code changes (not in the prompt file, but shipped together):
- `/api/suggest/route.ts`: server-side `hasFactualClaim()` regex injects `FACTUAL_CLAIMS_DETECTED: yes` + mandatory-fact-check instruction into user message.
- `/api/suggest/route.ts` + `lib/suggest.ts`: reject too-short transcript instead of generating generic cold-start "meeting setup" batches.
- `/api/suggest/route.ts` classifier: bias system-design interviews to "interview" not "technical" (evaluative framing cue).
- `/api/chat/route.ts`: detail-expand `max_tokens` 400 → 200 (prevents 250-word table escapes).
- `DEFAULT_DETAIL_PROMPT` (`prompts.ts`): forbids `###` headers, numbered lists with sub-bullets, table+list combos.
- `store.ts` persist v4 → v5 so existing users pick up v2.

### v3.0.0 — action-first interview tuning
Changes vs v2.0.0:
1. **ACTION-FIRST PREVIEW SHAPES**: every kind now tells the user what to say or do next.
2. **INTERVIEW BIAS**: in interview mode, prefer question / answer / talking-point; low-value trivia fact-checks are explicitly called out as failures.
3. **TOPIC ANTI-REPEAT**: repeated underlying topics are banned even when the kind changes.
4. **MOVE THE INTERVIEW FORWARD**: at least one card per batch must advance the current decision branch in the next 30 seconds.

Paired code changes:
- `factCheck.ts`: fact-check forcing now looks only at strong claims in the last 2 transcript lines and skips topics already covered by recent suggestions.
- `transcriptContext.ts`: suggestions, detail, chat, and eval now use dense recent context plus sparse older excerpts instead of dropping all older transcript once the character limit is reached.
- `TranscriptPanel.tsx` / settings: per-chunk YOU/OTHER classification is no longer required for suggestion quality; `userRole` remains as a high-level framing hint.
- `DEFAULT_DETAIL_PROMPT`: external numbers, product policies, limits, and benchmarks must be framed as transcript-grounded assumptions or verification items, not invented facts.
- `store.ts`: persist v5 -> v9 so existing users pick up v3/context/detail/chat-prompt updates without losing non-prompt settings.

### v3.1.0 - foreground and safety tightening
Changes vs v3.0.0:
1. **STRICTER FOREGROUND**: earlier sampled context is memory only; card triggers must come from the final 1-2 RECENT_CONTEXT entries.
2. **NO SIDE-QUESTIONS**: avoids adjacent best-practice topics that are not opened by the current foreground.
3. **TALKING-POINT ACTIONABILITY**: talking points now require exact spoken wording.
4. **NARROWER FACT-CHECK FORCING**: fact-check forcing requires a numeric/bounded claim plus a decision-relevant metric.
5. **ORIGINAL EVAL FIXTURES**: eval scenarios were renamed/replaced with project-specific transcripts.

### v3.2.0 - first-batch responsiveness and cleaner card text
Changes vs v3.1.0:
1. **FIRST TRANSCRIPT REFRESH**: suggestions try immediately when the first transcript chunk arrives instead of waiting for the next timer tick.
2. **LOWER READINESS FLOOR**: minimum transcript length lowered from 220 to 120 characters so a real 30-second chunk can produce cards.
3. **NO VISIBLE ACTION PREFIXES**: previews still include actionable wording, but cards no longer show redundant prefixes like `Ask:`, `Raise:`, or `Clarify:`.

## Reproducing

```bash
# from repo-root/web (GROQ_API_KEY comes from ../scripts/.env automatically)
npm run eval
```

Reports are written to `web/scripts/eval-reports/eval-report-<timestamp>.md`
(gitignored). Each report has per-criterion averages, kind distribution,
per-meeting breakdown, and a "Weakest Suggestions" section listing any card
scored below 10/15.

## Comparing versions

1. Run eval on current version, note the score row.
2. Edit `index.ts` — change `DEFAULT_SUGGEST_PROMPT` between `SUGGESTION_PROMPT_V1` and `SUGGESTION_PROMPT_V2` (and bump `CURRENT_SUGGESTION_VERSION` to match).
3. Re-run eval.
4. Record the new row in the table above with deltas.

Changes under ~0.2 per criterion are judge noise — don't ship marginal improvements.

## If v2.0 regresses

Bisect by reverting ONE prompt change at a time in a new `v2.1.ts` / `v2.2.ts` /
`v2.3.ts`:
- **v2.1** = v2.0 minus FOREGROUND rule
- **v2.2** = v2.0 minus ALGORITHMIC VARIETY
- **v2.3** = v2.0 minus PREVIEW-MUST-QUOTE

Keep the change that moved the regressed criterion the most.
