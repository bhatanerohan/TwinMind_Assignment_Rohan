export type Role = "user" | "assistant";

export type Speaker = "user" | "other" | "unknown";

export interface TranscriptChunk {
  id: string;
  text: string;
  startedAt: number;
  endedAt: number;
  speaker?: Speaker;
  speakerConfidence?: number;
}

export type UserRole = "unknown" | "host" | "guest" | "observer";

export type SuggestionKind =
  | "question"
  | "answer"
  | "fact-check"
  | "talking-point"
  | "clarify";

export interface Suggestion {
  id: string;
  kind: SuggestionKind;
  title: string;
  preview: string;
}

export interface SuggestionBatch {
  id: string;
  createdAt: number;
  suggestions: Suggestion[];
}

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
  fromSuggestionId?: string;
}

export interface Settings {
  apiKey: string;
  userRole: UserRole;
  suggestPrompt: string;
  detailPrompt: string;
  chatPrompt: string;
  suggestContextChars: number;
  detailContextChars: number;
  chatContextChars: number;
  whisperModel: "whisper-large-v3" | "whisper-large-v3-turbo";
  chatModel: "openai/gpt-oss-120b";
  refreshIntervalMs: number;
  chunkIntervalMs: number;
}

export type MeetingType =
  | "unknown"
  | "sales"
  | "interview"
  | "technical"
  | "pitch"
  | "support"
  | "planning"
  | "casual"
  | "other";

export interface SessionMeta {
  meetingType: MeetingType;
  meetingTypeConfidence: number; // 0..1
  meetingTypeRationale: string; // one sentence explaining the classification
  classifiedAt: number | null; // ms timestamp, or null if never classified
}

export interface SessionExport {
  exportedAt: string;
  sessionStartedAt: string | null;
  sessionMeta: {
    meetingType: MeetingType;
    meetingTypeConfidence: number;
    meetingTypeRationale: string;
    classifiedAt: string | null;
  };
  transcript: Array<{ startedAt: string; endedAt: string; text: string; speaker?: Speaker }>;
  batches: Array<{
    createdAt: string;
    suggestions: Array<{ kind: SuggestionKind; title: string; preview: string }>;
  }>;
  chat: Array<{
    createdAt: string;
    role: Role;
    content: string;
    fromSuggestionTitle?: string;
  }>;
}
