import { groqChat, readApiKeyFromRequest, type GroqChatMessage } from "@/lib/groq";
import type { MeetingType, Suggestion, SuggestionKind, UserRole } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SuggestRequestBody {
  transcript: string;
  systemPrompt: string;
  previousSuggestions: Array<{ title: string; preview: string }>;
  model: string;
  meetingType?: MeetingType;
  userRole?: UserRole;
}

const VALID_KINDS: ReadonlySet<SuggestionKind> = new Set([
  "question",
  "answer",
  "fact-check",
  "talking-point",
  "clarify",
]);

const VALID_MEETING_TYPES: ReadonlySet<MeetingType> = new Set([
  "unknown",
  "sales",
  "interview",
  "technical",
  "pitch",
  "support",
  "planning",
  "casual",
  "other",
]);

// Types the classifier is allowed to emit (excludes "unknown").
const CLASSIFIER_OUTPUT_TYPES: ReadonlySet<MeetingType> = new Set([
  "sales",
  "interview",
  "technical",
  "pitch",
  "support",
  "planning",
  "casual",
  "other",
]);

const CLASSIFY_MIN_CHARS = 500;

const CLASSIFIER_SYSTEM_PROMPT = `You classify live conversation transcripts into meeting types for a meeting copilot.

Given a transcript (may be a partial conversation), return STRICT JSON:
{"type":"sales|interview|technical|pitch|support|planning|casual|other","confidence":0.0-1.0,"rationale":"one short sentence"}

Types:
• sales — someone is selling to or evaluating a vendor; pricing, deals, demos, objections
• interview — job interview, either direction; skills, experience, culture-fit questions
• technical — engineering/design discussion; architecture, implementation, debugging
• pitch — founder/creator pitching an idea or product to an audience or investor
• support — customer support, troubleshooting a user's problem
• planning — internal planning, standup, roadmap, project coordination
• casual — informal chat, small talk, no clear business purpose
• other — anything else or ambiguous

Return ONLY the JSON object. No prose.`;

function isValidKind(value: unknown): value is SuggestionKind {
  return typeof value === "string" && VALID_KINDS.has(value as SuggestionKind);
}

function isValidMeetingType(value: unknown): value is MeetingType {
  return typeof value === "string" && VALID_MEETING_TYPES.has(value as MeetingType);
}

interface ClassificationResult {
  meetingType: MeetingType;
  meetingTypeConfidence: number;
  meetingTypeRationale: string;
}

async function classifyMeetingType(
  apiKey: string,
  model: string,
  transcript: string,
): Promise<ClassificationResult | null> {
  try {
    const messages: GroqChatMessage[] = [
      { role: "system", content: CLASSIFIER_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Classify this transcript:\n\n${transcript}`,
      },
    ];

    const upstream = await groqChat(apiKey, {
      model,
      messages,
      response_format: { type: "json_object" },
      reasoning_effort: "low",
      max_tokens: 300,
      temperature: 0.1,
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      console.error("[suggest] classifier upstream failed:", upstream.status, errText);
      return null;
    }

    const raw = (await upstream.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const content = raw.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      console.error("[suggest] classifier returned no content");
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      console.error("[suggest] classifier returned invalid JSON:", err);
      return null;
    }

    if (!parsed || typeof parsed !== "object") {
      console.error("[suggest] classifier JSON not an object");
      return null;
    }

    const rec = parsed as {
      type?: unknown;
      confidence?: unknown;
      rationale?: unknown;
    };

    const meetingType: MeetingType =
      isValidMeetingType(rec.type) && CLASSIFIER_OUTPUT_TYPES.has(rec.type)
        ? rec.type
        : "other";

    const confidenceRaw =
      typeof rec.confidence === "number" ? rec.confidence : 0;
    const meetingTypeConfidence = Math.max(0, Math.min(1, confidenceRaw));

    const meetingTypeRationale =
      typeof rec.rationale === "string" ? rec.rationale : "";

    return { meetingType, meetingTypeConfidence, meetingTypeRationale };
  } catch (err) {
    console.error("[suggest] classifier threw:", err);
    return null;
  }
}

export async function POST(request: Request) {
  const apiKey = readApiKeyFromRequest(request);
  if (!apiKey) {
    return Response.json({ error: "Missing or invalid x-groq-key header" }, { status: 401 });
  }

  const body = (await request.json()) as SuggestRequestBody;
  const { transcript, systemPrompt, previousSuggestions, model } = body;
  const incomingMeetingType: MeetingType = isValidMeetingType(body.meetingType)
    ? body.meetingType
    : "unknown";

  let classification: ClassificationResult | null = null;
  if (
    incomingMeetingType === "unknown" &&
    typeof transcript === "string" &&
    transcript.length >= CLASSIFY_MIN_CHARS
  ) {
    classification = await classifyMeetingType(apiKey, model, transcript);
  }

  const effectiveMeetingType: MeetingType =
    classification?.meetingType ?? incomingMeetingType;

  const transcriptBlock =
    transcript && transcript.trim().length > 0
      ? transcript
      : "(empty — conversation just starting)";

  const previousBlock =
    previousSuggestions && previousSuggestions.length > 0
      ? previousSuggestions.map((s) => `- ${s.title}: ${s.preview}`).join("\n")
      : "(none yet)";

  const userRole: UserRole = body.userRole ?? "unknown";

  const roleHint =
    userRole === "unknown"
      ? "USER_ROLE: unknown — frame suggestions neutrally (avoid assuming whether the user is asking or answering)."
      : userRole === "host"
        ? "USER_ROLE: host — the user is leading (interviewer, seller, facilitator). Bias suggestions toward probing questions and reacting to the guest's answers."
        : userRole === "guest"
          ? "USER_ROLE: guest — the user is responding (candidate, prospect, customer). Bias suggestions toward answers the user might give and counter-questions the user could ask."
          : "USER_ROLE: observer — the user is listening in on others' conversation. Frame suggestions as analytical commentary, not as things for the user to say.";

  const userContent =
    `MEETING_TYPE: ${effectiveMeetingType}\n` +
    `${roleHint}\n\n` +
    `RECENT_TRANSCRIPT (turns prefixed with [YOU] / [OTHER] / [?] based on classifier):\n${transcriptBlock}\n\n` +
    `PREVIOUSLY_SHOWN_SUGGESTIONS (do not repeat or near-repeat these):\n${previousBlock}\n\n` +
    `Return exactly 3 suggestions as strict JSON matching the schema.`;

  const messages: GroqChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ];

  const upstream = await groqChat(apiKey, {
    model,
    messages,
    response_format: { type: "json_object" },
    reasoning_effort: "low",
    max_tokens: 1200,
    temperature: 0.7,
  });

  if (!upstream.ok) {
    const errorText = await upstream.text();
    return new Response(errorText, { status: upstream.status });
  }

  const raw = (await upstream.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };

  const content = raw.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    return Response.json(
      { error: "Malformed suggestion JSON", raw: null },
      { status: 502 },
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return Response.json(
      { error: "Malformed suggestion JSON", raw: content },
      { status: 502 },
    );
  }

  if (!parsed || typeof parsed !== "object") {
    return Response.json(
      { error: "Malformed suggestion JSON", raw: content },
      { status: 502 },
    );
  }

  const candidate = (parsed as { suggestions?: unknown }).suggestions;
  if (!Array.isArray(candidate) || candidate.length !== 3) {
    return Response.json(
      { error: "Malformed suggestion JSON", raw: content },
      { status: 502 },
    );
  }

  const suggestions: Suggestion[] = [];
  for (const item of candidate) {
    if (!item || typeof item !== "object") {
      return Response.json(
        { error: "Malformed suggestion JSON", raw: content },
        { status: 502 },
      );
    }
    const rec = item as { kind?: unknown; title?: unknown; preview?: unknown };
    if (!isValidKind(rec.kind)) {
      return Response.json(
        { error: "Malformed suggestion JSON", raw: content },
        { status: 502 },
      );
    }
    if (typeof rec.title !== "string" || rec.title.trim().length === 0) {
      return Response.json(
        { error: "Malformed suggestion JSON", raw: content },
        { status: 502 },
      );
    }
    if (typeof rec.preview !== "string" || rec.preview.trim().length === 0) {
      return Response.json(
        { error: "Malformed suggestion JSON", raw: content },
        { status: 502 },
      );
    }
    suggestions.push({
      id: crypto.randomUUID(),
      kind: rec.kind,
      title: rec.title,
      preview: rec.preview,
    });
  }

  const response: {
    suggestions: Suggestion[];
    meetingType?: MeetingType;
    meetingTypeConfidence?: number;
    meetingTypeRationale?: string;
  } = { suggestions };

  if (classification) {
    response.meetingType = classification.meetingType;
    response.meetingTypeConfidence = classification.meetingTypeConfidence;
    response.meetingTypeRationale = classification.meetingTypeRationale;
  }

  return Response.json(response);
}
