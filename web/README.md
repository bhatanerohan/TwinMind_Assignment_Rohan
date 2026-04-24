# TwinMind Live Suggestions

A live meeting copilot. Capture the conversation from your mic, see the transcript update every 30s, and get three fresh, context-aware suggestions (questions to ask, answers, talking points, fact-checks, clarifications) every 30s. Click any suggestion for an expanded answer in the chat column, or ask your own questions — all grounded in the running transcript. Export the whole session as JSON or plain text when you're done.

Single-page web app. No auth, no database, no server-side persistence. Your Groq API key lives only in the browser's localStorage.

## Stack

| Choice | Why |
| --- | --- |
| Next.js 16 (App Router) + TypeScript | Single framework for UI and API routes; server routes keep Groq calls off the client. |
| React 19.2 | Paired with Next 16. |
| Tailwind CSS v4 | Utility-first styling; no extra CSS tooling. |
| Zustand 5 + `zustand/persist` | Tiny, ergonomic store. Settings persist to `localStorage`; session state is in-memory. |
| `react-markdown` + `remark-gfm` | Chat assistant replies render markdown (tables, lists, code). |
| `lucide-react` | Icon set for header, settings, card actions. |
| Groq via raw `fetch` | No SDK; one small wrapper in `lib/groq.ts` for chat + transcription. |

No auth, no database, no RAG. Session state is in-browser only, per spec.

## Models (fixed by the spec)

- `whisper-large-v3` — transcription.
- `openai/gpt-oss-120b` — suggestions, meeting-type classification, expanded answers, chat.

The spec locks these so candidates are judged on prompting, not model choice. Settings exposes `whisper-large-v3-turbo` as a speed/quality toggle on the transcription model.

## Setup

### Prerequisites

- Node.js 20+ (developed against Node 24.13.0).
- A Groq API key — get one at https://console.groq.com/keys.

### Install

```bash
cd web
npm install
npm run dev
```

Open http://localhost:3000, click the gear icon in the header, and paste your Groq API key (starts with `gsk_`). The key is stored in `localStorage` only.

### Deploy (Vercel)

`vercel` or import the repo in the Vercel dashboard. The `web/` directory is the project root. No environment variables are needed — users provide their own key at runtime.

## How to use

1. Paste your Groq key in Settings.
2. Click the mic button in the left column — grant microphone permission.
3. Speak normally. Every ~30s a new transcript chunk appears on the left and a fresh batch of 3 suggestions appears on top of the middle column.
4. Click any suggestion card — an expanded, grounded answer streams into the right column.
5. Type your own questions in the chat input at the bottom of the right column.
6. Click **JSON** or **TXT** in the header to download the full session (transcript + every suggestion batch + chat log).

## Prompt strategy

Prompt engineering is the #1 evaluation criterion. What follows is the default strategy shipped in `lib/prompts.ts`. All three prompts are editable live in Settings.

### Three prompts, all editable

- **Live-suggestions prompt** — drives the middle column. Receives the recent transcript, the inferred meeting type, and the last few batches of suggestions (to dedupe). Must return strict JSON of exactly 3 items.
- **Expanded-answer prompt** — used when the user clicks a suggestion card. Longer transcript window; lead with the direct answer, no preamble.
- **Chat prompt** — used when the user types freely in the right column. Same full-transcript grounding but a more conversational stance.

### Meeting-type inference (sticky, once per session)

To route suggestions correctly — a sales call deserves very different "questions to ask" than a job interview — the server classifies the meeting into one of 8 types: `sales`, `interview`, `technical`, `pitch`, `support`, `planning`, `casual`, `other`. The classifier is lazy: it runs only once the transcript crosses **500 chars** (`CLASSIFY_MIN_CHARS`) and has never been classified before. The result is cached in the session store and echoed back through the `MEETING_TYPE:` header of every subsequent suggest prompt. One extra call, paid once per session.

### Routing rules (hard constraints in the suggest prompt)

The suggest prompt enforces:

1. The trigger for each card must come from the final one or two recent transcript entries.
2. Previously shown topics are treated as off-limits unless the foreground changes materially.
3. Fact-check cards are forced only for decision-relevant factual claims.
4. Interview-style conversations bias toward questions, answers, and talking points instead of trivia fact-checks.
5. The three cards must be varied by kind and topic.

### Preview-must-be-useful-alone

The single most load-bearing rule. The `preview` field has to deliver value **on its own**, even if the user never clicks the card. Teasers ("Consider asking about their timeline") lose to front-loaded insight ("Ask which quarter they need this live. Q1 vs Q4 changes your motion — Q1 champions have a real deadline to anchor to"). The prompt ships three BAD / GOOD paired examples to teach the distinction.

### Context windowing

| Call | Default window | Rationale |
| --- | --- | --- |
| Suggest | 6,000 chars | Recent 3–5 minutes of speech; keeps suggestion latency low on Groq's 8K TPM free tier. |
| Detail (click-expand) | 20,000 chars | More grounding when the user has decided a topic is worth reading about. |
| Chat | 20,000 chars | Same reasoning as Detail. |

Trade-off: Groq free-tier TPM is the binding constraint. Larger windows = deeper grounding but more chance of 429 on chat bursts. A rolling summary of the older transcript (instead of a hard char cap) is on the roadmap.

### Rate-limit posture

- `/api/transcribe` retries up to 3 times with linear backoff on transient network failures (`ECONNRESET`, `ETIMEDOUT`, `UND_ERR_SOCKET`, `fetch failed`, 5xx).
- Classification failures degrade gracefully — meeting type stays `unknown` and suggestions still ship.
- Chat is the real bottleneck (8K TPM on the free tier). No client-side retry; the user can resend.

## Architecture

```
web/
  src/app/
    api/
      transcribe/route.ts   POST multipart audio → Groq Whisper
      suggest/route.ts      POST JSON → classify-if-needed, then Groq chat with JSON mode
      chat/route.ts         POST JSON → streaming SSE passthrough from Groq
    layout.tsx, page.tsx, globals.css
  src/components/
    Header, PanelHeader, TranscriptPanel, SuggestionsPanel,
    SuggestionCard, ChatPanel, SettingsDialog, MarkdownMessage
  src/lib/
    types.ts, store.ts, prompts.ts      state + defaults
    groq.ts                              thin fetch wrapper
    recorder.ts                          MediaRecorder rotation
    transcribe.ts, suggest.ts, chat.ts   client → API-route helpers
    export.ts                            session → JSON/TXT download
```

Data flow:

- Browser `MediaRecorder` → rotates every 30s → each rotation produces one independently-decodable webm blob → `POST /api/transcribe` → Groq Whisper → text appended to the Zustand session store.
- On an interval (30s while recording) → `POST /api/suggest` with `{ transcript slice, meetingType, previousSuggestions }` → Groq chat (JSON mode) → validated → new batch prepended to `state.batches`.
- Click on a card → push a `user` message + empty `assistant` message into the chat store → `POST /api/chat` (SSE) → tokens streamed back → appended to the last assistant message.
- Typed chat message → same as above, without the `fromSuggestion` hint.
- Export → serialize transcript + batches + chat to JSON or plain text, trigger a download.

Every Groq call goes through a server-side Next.js API route. The user's API key rides along in an `x-groq-key` header on every request, sourced from `localStorage` via zustand/persist. It is never persisted server-side and never bundled into the build.

## Tradeoffs and deliberate non-goals

- **No RAG, no memory, no account system.** Spec carve-out; real TwinMind has these.
- **30s chunk rotation instead of `MediaRecorder` timeslice.** Each chunk is an independently-decodable webm (complete Opus container with headers), which Whisper accepts standalone. Timeslice-mode deltas can't be sent in isolation. Cost: a single `MediaRecorder` stop/start gap on every rotation; we mitigate by starting the next recorder **before** stopping the current one, so the mic track stays hot.
- **One model for everything** (aside from Whisper). Same model across all candidates by spec; prompt design is the differentiator.
- **No tests.** 10-day take-home, manual test only. Would start with API-route contract tests if I had another week.
- **Dark theme only.** Matches the provided prototype.
- **No SSR for `page.tsx`.** A `mounted` flag gates rendering to avoid the zustand-persist SSR-hydration mismatch. Small CLS cost for a much simpler store setup.
- **No streaming of the suggestion JSON.** The full 3-item batch lands at once. Streaming it would shave ~500ms off first-card render — on the roadmap.

## What would be Phase 3 if I had more time

- Rolling summary of older transcript so we can keep deeper context without blowing TPM budget.
- Per-meeting-type specialized prompt variants (sales prompt ≠ interview prompt ≠ debugging-session prompt).
- Streaming the suggestion JSON with a partial-JSON parser for faster first-card render.
- Dev-mode A/B prompt harness — run two prompt versions on the same transcript side-by-side to diff the output qualitatively.

See also the repo-root `README.md` for the submission overview.
