# TwinMind Live Suggestions

A browser-based live meeting copilot for the TwinMind assignment. The app listens through the user's microphone, transcribes roughly every 30 seconds, generates three timely suggestions from the live transcript, and lets the user click any suggestion for a detailed chat answer.

The deployable Next.js app lives in `web/`. The main application source is already under `web/src`, which is the standard Next.js structure for this repo. Keeping `web/` as the app root makes Vercel, package scripts, and dependencies clear.

## Features

- Live mic recording with 30-second audio chunks.
- Groq Whisper transcription using `whisper-large-v3`.
- Three fresh live suggestions per refresh using `openai/gpt-oss-120b`.
- Suggestion types include questions, answers, talking points, fact-checks, and clarifications.
- Click-to-expand chat answers grounded in the running transcript.
- Free-form chat with capped history and streamed responses.
- Editable prompts and context windows in Settings.
- JSON and plain-text session export with transcript, suggestion batches, chat history, and timestamps.

## Stack

| Area | Choice |
| --- | --- |
| App | Next.js 16 App Router + TypeScript |
| UI | React 19, Tailwind CSS v4, lucide-react |
| State | Zustand with `zustand/persist` for settings |
| AI | Groq APIs via server-side Next.js routes |
| Markdown | `react-markdown` + `remark-gfm` |

No login, database, or server-side persistence is used. The Groq API key is entered by the user in Settings and stored only in browser `localStorage`.

## Setup

```bash
cd web
npm install
npm run dev
```

Open `http://localhost:3000`. Settings opens automatically on each page load so the evaluator can paste a Groq API key beginning with `gsk_`.

## Build

```bash
cd web
npm run build
```

## Prompt Strategy

The core prompt decision is to optimize for live usefulness instead of meeting summarization. The app should surface what the user can say or check in the next 30 seconds, not generic advice about the whole call.

### Prompt Surfaces

- **Live suggestions:** returns exactly three JSON cards for the middle column. It receives meeting type, transcript context, and previously shown suggestions so it can stay timely and avoid repeats.
- **Expanded answer:** runs when a suggestion is clicked. It gets a larger transcript window and the clicked card, then streams a direct answer into chat.
- **Free-form chat:** handles user questions in the right column. It uses transcript grounding plus capped recent chat history so long sessions remain responsive.

All three prompts are editable in Settings, but the defaults are versioned in `web/src/lib/prompt-versions/`.

### Context Construction

The transcript is not passed as one unbounded blob. `web/src/lib/transcriptContext.ts` builds a mixed context window:

- **Dense recent context:** about 72% of the budget is reserved for the newest transcript chunks. This is the main signal for live timing.
- **Sparse older context:** the remaining budget is used for up to 8 evenly spaced verbatim excerpts from earlier in the session. This preserves prior constraints without paying for the entire transcript.
- **Foreground rule:** the final 1-2 recent entries are treated as the only valid trigger for new cards. Older excerpts are memory only.
- **No synthetic summary:** older context is sampled verbatim rather than summarized, so the model is less likely to inherit mistakes from a generated summary.

Default windows are 6,000 chars for suggestions and 20,000 chars for clicked answers/chat.

### Suggestion Selection Rules

The live prompt uses hard routing rules rather than asking for "good suggestions" generally:

- Suggestions must be grounded in the current foreground, not old topics.
- The three cards should vary by both kind and topic.
- Previous cards are sent back to the model and treated as off-limits unless the conversation clearly pivots.
- Meeting type is classified once after enough transcript exists, then reused as routing context.
- Interview-like calls bias toward questions, answers, and talking points instead of trivia fact-checks.
- Fact-check cards are only forced when the latest transcript contains a decision-relevant factual or numeric claim.
- Card previews must be useful without clicking and include wording the user could say aloud with little editing.

### Timing And Latency Choices

- Audio is recorded in 30-second MediaRecorder rotations so each uploaded blob is independently decodable by Whisper.
- Suggestions normally refresh every 30 seconds while recording.
- The first suggestion batch is attempted immediately after the first real transcript chunk, with a 120-character readiness floor to avoid empty setup cards.
- Suggestion JSON is returned as a complete batch instead of streamed. Chat responses stream and are buffered client-side to reduce UI lag.

### Evaluation Loop

Prompt changes are tested with `npm run eval` in `web/`. The eval harness runs multiple meeting transcripts across repeated cycles, scores specificity, actionability, preview quality, timing fit, meeting-type calibration, and cross-batch variety, then writes reports under `web/scripts/eval-reports/` (gitignored).

Prompt versions and score notes are documented in `web/src/lib/prompt-versions/README.md`.

## Export Format

The header has two export buttons:

- `JSON` for structured evaluation.
- `TXT` for human-readable review.

Both include transcript chunks, suggestion batches, chat history, and timestamps, matching the assignment requirement.

## Project Layout

```text
web/
  src/app/
    api/chat/route.ts
    api/suggest/route.ts
    api/transcribe/route.ts
    page.tsx
  src/components/
    ChatPanel.tsx
    Header.tsx
    SettingsDialog.tsx
    SuggestionsPanel.tsx
    TranscriptPanel.tsx
  src/lib/
    chat.ts
    export.ts
    groq.ts
    prompts.ts
    recorder.ts
    store.ts
    transcriptContext.ts
```

## Tradeoffs

- Speaker identification is not a primary signal because 30-second mic chunks can mix speakers; suggestions rely on transcript content and meeting type instead.
- Suggestion JSON is not streamed; each refresh renders a complete three-card batch.
- Chat context is capped to keep long sessions responsive and reduce Groq rate-limit pressure.
- Session data is in memory and lost on reload, per assignment scope.
