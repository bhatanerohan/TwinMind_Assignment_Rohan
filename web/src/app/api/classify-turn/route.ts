import { groqChat, readApiKeyFromRequest, type GroqChatMessage } from "@/lib/groq";
import type { Speaker, UserRole } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ClassifyTurnRequestBody {
  model: string;
  userRole: UserRole;
  currentText: string;
  previousTurns: Array<{ text: string; speaker: Speaker }>;
}

interface ClassifyTurnResponseBody {
  speaker: Speaker;
  confidence: number;
}

const VALID_SPEAKERS: ReadonlySet<Speaker> = new Set(["user", "other", "unknown"]);

function isValidSpeaker(value: unknown): value is Speaker {
  return typeof value === "string" && VALID_SPEAKERS.has(value as Speaker);
}

const CLASSIFIER_SYSTEM_PROMPT = `You are a speaker-attribution classifier for a live meeting copilot.

Your only job: decide whether a given transcript turn was spoken by THE USER (the person wearing the mic) or THE OTHER SIDE (anyone else in the conversation).

You will receive:
• USER_ROLE — who the user is in this conversation. One of:
  - "host"     → the user is leading the conversation (interviewer, sales rep, support agent, facilitator, manager).
  - "guest"    → the user is the respondent (candidate, prospect, customer, reportee).
  - "observer" → the user is listening/observing (watching a recording, taking notes on others' conversation). In this case, label most content-bearing turns as "other".
  - "unknown"  → no prior; use content cues only.
• PREVIOUS_TURNS — the last few labeled turns, for conversational context.
• CURRENT_TURN — the turn to classify.

ROLE-SPECIFIC HEURISTICS (apply these first — they dominate the decision):

If USER_ROLE is "host":
  USER typically speaks as: the asker. Short probes ("Tell me about X", "How would you design Y", "What scale are you targeting"), acknowledgments ("mhm", "okay", "interesting", "got it"), constraint-setters ("let's limit it to", "can we focus on"), time checks.
  OTHER typically speaks as: the answerer. Longer explanations, thinking aloud, first-person narrative about their approach or experience ("Let me think", "I'll just take some notes", "In my experience", "I was an engineering manager at Google", "So for X, I'd use Y because..."). Questions the OTHER asks are usually clarifying ("can we constrain this?", "is that okay?").
  RULE: Extended monologues, thinking-out-loud, or first-person approach narration almost always = OTHER when user is host.

If USER_ROLE is "guest":
  USER typically speaks as: the answerer. Longer explanations, thinking aloud, first-person approach narration.
  OTHER typically speaks as: the asker. Short probes, acknowledgments, constraint-setters.
  RULE: Extended monologues and first-person narration = USER when user is guest.

If USER_ROLE is "observer":
  Default to "other" unless a turn is clearly meta-commentary ABOUT the conversation (unusual).

If USER_ROLE is "unknown":
  Emit "unknown" with confidence 0.3 unless content is absolutely unambiguous.

SECONDARY CUES (use only when role-based heuristic is ambiguous):
1. Turn-taking continuity: if previous turn was "user" and current continues the same idea mid-sentence or picks up where it left off, stay "user".
2. Explicit self-reference + role match: "I was an engineering manager at Google" after "tell me about yourself" strongly points to the answerer; use role to resolve which side that is.

Return STRICT JSON ONLY:
{"speaker":"user"|"other"|"unknown","confidence":0.0-1.0}

No prose, no explanation, no markdown fences.`;

export async function POST(request: Request) {
  const apiKey = readApiKeyFromRequest(request);
  if (!apiKey) {
    return Response.json({ error: "Missing or invalid x-groq-key header" }, { status: 401 });
  }

  const body = (await request.json()) as ClassifyTurnRequestBody;
  const { model, userRole, currentText, previousTurns } = body;

  if (typeof currentText !== "string" || currentText.trim().length === 0) {
    return Response.json({ speaker: "unknown", confidence: 0 } satisfies ClassifyTurnResponseBody);
  }

  if (userRole === "unknown") {
    return Response.json({ speaker: "unknown", confidence: 0 } satisfies ClassifyTurnResponseBody);
  }

  const previousBlock =
    previousTurns && previousTurns.length > 0
      ? previousTurns
          .slice(-4)
          .map((t) => `[${t.speaker}] ${t.text}`)
          .join("\n")
      : "(no previous turns)";

  const userContent =
    `USER_ROLE: ${userRole}\n\n` +
    `PREVIOUS_TURNS:\n${previousBlock}\n\n` +
    `CURRENT_TURN:\n${currentText}\n\n` +
    `Classify CURRENT_TURN. Return strict JSON.`;

  const messages: GroqChatMessage[] = [
    { role: "system", content: CLASSIFIER_SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ];

  try {
    const upstream = await groqChat(apiKey, {
      model,
      messages,
      response_format: { type: "json_object" },
      reasoning_effort: "low",
      max_tokens: 150,
      temperature: 0.1,
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      console.error("[classify-turn] upstream failed:", upstream.status, errText);
      return Response.json({ speaker: "unknown", confidence: 0 } satisfies ClassifyTurnResponseBody);
    }

    const raw = (await upstream.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const content = raw.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      return Response.json({ speaker: "unknown", confidence: 0 } satisfies ClassifyTurnResponseBody);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return Response.json({ speaker: "unknown", confidence: 0 } satisfies ClassifyTurnResponseBody);
    }

    if (!parsed || typeof parsed !== "object") {
      return Response.json({ speaker: "unknown", confidence: 0 } satisfies ClassifyTurnResponseBody);
    }

    const rec = parsed as { speaker?: unknown; confidence?: unknown };
    const speaker: Speaker = isValidSpeaker(rec.speaker) ? rec.speaker : "unknown";
    const rawConf = typeof rec.confidence === "number" ? rec.confidence : 0;
    const confidence = Math.max(0, Math.min(1, rawConf));

    return Response.json({ speaker, confidence } satisfies ClassifyTurnResponseBody);
  } catch (err) {
    console.error("[classify-turn] threw:", err);
    return Response.json({ speaker: "unknown", confidence: 0 } satisfies ClassifyTurnResponseBody);
  }
}
