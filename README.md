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

Open `http://localhost:3000`, click Settings, and paste a Groq API key beginning with `gsk_`.

## Build

```bash
cd web
npm run build
```

## Prompt Strategy

The suggestion prompt focuses on what is happening now, not generic meeting advice:

- Dense recent transcript context is always included.
- Sparse older transcript excerpts preserve earlier constraints without overloading the prompt.
- The final one or two recent transcript entries are treated as foreground.
- Previous suggestions are sent back to reduce repeated topics.
- Meeting type is classified once per session and reused as routing context.
- Fact-check cards are only forced for decision-relevant claims.
- Card previews are designed to be useful without clicking.

Prompt versions and eval notes are documented in `web/src/lib/prompt-versions/README.md`.

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

More implementation details are in `web/README.md` and `CODE_GUIDE.md`.

## Tradeoffs

- Speaker identification is not a primary signal because 30-second mic chunks can mix speakers; suggestions rely on transcript content and meeting type instead.
- Suggestion JSON is not streamed; each refresh renders a complete three-card batch.
- Chat context is capped to keep long sessions responsive and reduce Groq rate-limit pressure.
- Session data is in memory and lost on reload, per assignment scope.
