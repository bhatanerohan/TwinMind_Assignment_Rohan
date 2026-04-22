"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, RotateCcw, X } from "lucide-react";
import { useSettings } from "@/lib/store";
import {
  DEFAULT_CHAT_PROMPT,
  DEFAULT_DETAIL_PROMPT,
  DEFAULT_SUGGEST_PROMPT,
} from "@/lib/prompts";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function SettingsDialog({
  open,
  onOpenChange,
}: SettingsDialogProps) {
  const settings = useSettings((s) => s.settings);
  const updateSettings = useSettings((s) => s.updateSettings);
  const resetPrompts = useSettings((s) => s.resetPrompts);

  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  const apiKeyInvalid =
    settings.apiKey.length > 0 && !settings.apiKey.startsWith("gsk_");

  const handleResetAll = () => {
    const ok = window.confirm(
      "Reset all prompts to their defaults? This cannot be undone.",
    );
    if (ok) resetPrompts();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-slate-800 bg-slate-950 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
      >
        <div className="mb-5 flex items-center justify-between border-b border-slate-800 pb-4">
          <h2 className="text-lg font-semibold text-slate-100 tracking-tight">
            Settings
          </h2>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <section className="mb-6">
          <h3 className="mb-2 text-[11px] font-semibold tracking-[0.15em] uppercase text-slate-400">
            Groq API key
          </h3>
          <div className="flex gap-2">
            <input
              type={showKey ? "text" : "password"}
              value={settings.apiKey}
              onChange={(e) => updateSettings({ apiKey: e.target.value })}
              placeholder="gsk_..."
              className="flex-1 rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-sky-500/40 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="flex items-center gap-1 rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {showKey ? "Hide" : "Show"}
            </button>
          </div>
          {apiKeyInvalid && (
            <p className="mt-1.5 text-xs text-red-400">
              API key should start with &quot;gsk_&quot;.
            </p>
          )}
          <p className="mt-1.5 text-xs text-slate-500">
            Stored only in your browser&apos;s localStorage. Get a key at console.groq.com.
          </p>
        </section>

        <PromptSection
          title="Live suggestions prompt"
          value={settings.suggestPrompt}
          onChange={(v) => updateSettings({ suggestPrompt: v })}
          onReset={() => updateSettings({ suggestPrompt: DEFAULT_SUGGEST_PROMPT })}
        />

        <PromptSection
          title="Detailed answer (click-expand) prompt"
          value={settings.detailPrompt}
          onChange={(v) => updateSettings({ detailPrompt: v })}
          onReset={() => updateSettings({ detailPrompt: DEFAULT_DETAIL_PROMPT })}
        />

        <PromptSection
          title="Chat prompt"
          value={settings.chatPrompt}
          onChange={(v) => updateSettings({ chatPrompt: v })}
          onReset={() => updateSettings({ chatPrompt: DEFAULT_CHAT_PROMPT })}
        />

        <section className="mb-6">
          <h3 className="mb-2 text-[11px] font-semibold tracking-[0.15em] uppercase text-slate-400">
            Context windows (characters)
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <NumberField
              label="Suggest context"
              value={settings.suggestContextChars}
              onChange={(n) => updateSettings({ suggestContextChars: n })}
              help="Recent transcript window fed to suggestions."
            />
            <NumberField
              label="Detail context"
              value={settings.detailContextChars}
              onChange={(n) => updateSettings({ detailContextChars: n })}
              help="Transcript window when expanding a suggestion."
            />
            <NumberField
              label="Chat context"
              value={settings.chatContextChars}
              onChange={(n) => updateSettings({ chatContextChars: n })}
              help="Transcript window for free-form chat."
            />
          </div>
        </section>

        <section className="mb-6">
          <h3 className="mb-2 text-[11px] font-semibold tracking-[0.15em] uppercase text-slate-400">
            Refresh &amp; chunk intervals (ms)
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <NumberField
              label="Refresh interval"
              value={settings.refreshIntervalMs}
              onChange={(n) => updateSettings({ refreshIntervalMs: n })}
              help="How often to refetch live suggestions."
            />
            <NumberField
              label="Chunk interval"
              value={settings.chunkIntervalMs}
              onChange={(n) => updateSettings({ chunkIntervalMs: n })}
              help="Audio chunk length for transcription."
            />
          </div>
        </section>

        <section className="mb-6">
          <h3 className="mb-2 text-[11px] font-semibold tracking-[0.15em] uppercase text-slate-400">
            Your role in this conversation
          </h3>
          <select
            value={settings.userRole}
            onChange={(e) =>
              updateSettings({
                userRole: e.target.value as
                  | "unknown"
                  | "host"
                  | "guest"
                  | "observer",
              })
            }
            className="rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-sky-500/40 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
          >
            <option value="unknown">Not set — disable speaker detection</option>
            <option value="host">Host (interviewer, seller, facilitator)</option>
            <option value="guest">Guest (candidate, prospect, customer)</option>
            <option value="observer">Observer (listening to others' conversation)</option>
          </select>
          <p className="mt-1.5 text-xs text-slate-500">
            Used as a high-level framing hint only. Transcript chunks are no longer auto-labeled as YOU or OTHER because live chunks can mix speakers.
          </p>
        </section>

        <section className="mb-6">
          <h3 className="mb-2 text-[11px] font-semibold tracking-[0.15em] uppercase text-slate-400">
            Whisper model
          </h3>
          <select
            value={settings.whisperModel}
            onChange={(e) =>
              updateSettings({
                whisperModel: e.target.value as
                  | "whisper-large-v3"
                  | "whisper-large-v3-turbo",
              })
            }
            className="rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-sky-500/40 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
          >
            <option value="whisper-large-v3">whisper-large-v3</option>
            <option value="whisper-large-v3-turbo">whisper-large-v3-turbo</option>
          </select>
        </section>

        <div className="flex items-center justify-between border-t border-slate-800 pt-4">
          <button
            type="button"
            onClick={handleResetAll}
            className="flex items-center gap-1.5 rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            <RotateCcw className="h-4 w-4" /> Reset all prompts
          </button>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md bg-sky-500 hover:bg-sky-400 px-4 py-2 text-sm font-medium text-white"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function PromptSection({
  title,
  value,
  onChange,
  onReset,
}: {
  title: string;
  value: string;
  onChange: (v: string) => void;
  onReset: () => void;
}) {
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold tracking-[0.15em] uppercase text-slate-400">
          {title}
        </h3>
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-1 rounded-md border border-slate-800 bg-slate-900 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
        >
          <RotateCcw className="h-3 w-3" /> Reset
        </button>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-40 w-full resize-y rounded-md border border-slate-800 bg-slate-900 px-3 py-2 font-mono text-[12px] leading-relaxed text-slate-200 focus:border-sky-500/40 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
      />
    </section>
  );
}

function NumberField({
  label,
  value,
  onChange,
  help,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  help: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-300">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n) && n >= 0) onChange(n);
        }}
        className="w-full rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-sky-500/40 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
      />
      <span className="mt-1 block text-[11px] text-slate-500 leading-snug">{help}</span>
    </label>
  );
}
