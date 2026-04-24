"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  ChatMessage,
  MeetingType,
  SessionMeta,
  Settings,
  Suggestion,
  SuggestionBatch,
  TranscriptChunk,
} from "./types";

// Re-export MeetingType so consumers can import it from the store module.
export type { MeetingType };
import { DEFAULT_SETTINGS } from "./prompts";

const DEFAULT_SESSION_META: SessionMeta = {
  meetingType: "unknown",
  meetingTypeConfidence: 0,
  meetingTypeRationale: "",
  classifiedAt: null,
};

interface SessionState {
  transcript: TranscriptChunk[];
  batches: SuggestionBatch[];
  chat: ChatMessage[];
  isRecording: boolean;
  sessionStartedAt: number | null;
  sessionMeta: SessionMeta;

  addTranscriptChunk: (chunk: TranscriptChunk) => void;
  updateTranscriptChunkSpeaker: (
    chunkId: string,
    speaker: TranscriptChunk["speaker"],
    confidence?: number,
  ) => void;
  addBatch: (batch: SuggestionBatch) => void;
  addChatMessage: (message: ChatMessage) => void;
  updateLastChatMessage: (updater: (prev: string) => string) => void;
  updateChatMessage: (id: string, updater: (prev: string) => string) => void;
  setRecording: (recording: boolean) => void;
  setSessionMeta: (meta: Partial<SessionMeta>) => void;
  resetSession: () => void;
}

interface SettingsState {
  settings: Settings;
  setApiKey: (apiKey: string) => void;
  updateSettings: (partial: Partial<Settings>) => void;
  resetPrompts: () => void;
}

export const useSession = create<SessionState>((set) => ({
  transcript: [],
  batches: [],
  chat: [],
  isRecording: false,
  sessionStartedAt: null,
  sessionMeta: { ...DEFAULT_SESSION_META },

  addTranscriptChunk: (chunk) =>
    set((state) => ({ transcript: [...state.transcript, chunk] })),
  updateTranscriptChunkSpeaker: (chunkId, speaker, confidence) =>
    set((state) => ({
      transcript: state.transcript.map((c) =>
        c.id === chunkId
          ? { ...c, speaker, speakerConfidence: confidence ?? c.speakerConfidence }
          : c,
      ),
    })),
  addBatch: (batch) =>
    set((state) => ({ batches: [batch, ...state.batches] })),
  addChatMessage: (message) =>
    set((state) => ({ chat: [...state.chat, message] })),
  updateLastChatMessage: (updater) =>
    set((state) => {
      if (state.chat.length === 0) return state;
      const copy = state.chat.slice();
      const last = copy[copy.length - 1];
      copy[copy.length - 1] = { ...last, content: updater(last.content) };
      return { chat: copy };
    }),
  updateChatMessage: (id, updater) =>
    set((state) => ({
      chat: state.chat.map((m) =>
        m.id === id ? { ...m, content: updater(m.content) } : m,
      ),
    })),
  setRecording: (recording) =>
    set((state) => ({
      isRecording: recording,
      sessionStartedAt:
        recording && state.sessionStartedAt === null
          ? Date.now()
          : state.sessionStartedAt,
    })),
  setSessionMeta: (meta) =>
    set((state) => ({ sessionMeta: { ...state.sessionMeta, ...meta } })),
  resetSession: () =>
    set({
      transcript: [],
      batches: [],
      chat: [],
      isRecording: false,
      sessionStartedAt: null,
      sessionMeta: { ...DEFAULT_SESSION_META },
    }),
}));

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      settings: { apiKey: "", ...DEFAULT_SETTINGS },
      setApiKey: (apiKey) =>
        set((state) => ({ settings: { ...state.settings, apiKey } })),
      updateSettings: (partial) =>
        set((state) => ({ settings: { ...state.settings, ...partial } })),
      resetPrompts: () =>
        set((state) => ({ settings: { ...state.settings, ...DEFAULT_SETTINGS } })),
    }),
    {
      name: "twinmind-settings",
      storage: createJSONStorage(() => localStorage),
      version: 9,
      migrate: (persisted: unknown, version: number) => {
        const p = (persisted ?? {}) as { settings?: Partial<Settings> };
        const oldSettings = p.settings ?? {};
        const normalizedSettings = {
          ...DEFAULT_SETTINGS,
          ...oldSettings,
        };
        if (version < 9) {
          return {
            settings: {
              ...normalizedSettings,
              suggestPrompt: DEFAULT_SETTINGS.suggestPrompt,
              detailPrompt: DEFAULT_SETTINGS.detailPrompt,
              chatPrompt: DEFAULT_SETTINGS.chatPrompt,
            },
          } as SettingsState;
        }
        return {
          ...p,
          settings: normalizedSettings,
        } as SettingsState;
      },
    },
  ),
);

export function suggestionById(batches: SuggestionBatch[], id: string): Suggestion | undefined {
  for (const b of batches) {
    const hit = b.suggestions.find((s) => s.id === id);
    if (hit) return hit;
  }
  return undefined;
}
