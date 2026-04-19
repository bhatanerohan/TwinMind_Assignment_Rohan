"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCw } from "lucide-react";
import { useSession, useSettings } from "@/lib/store";
import type { Suggestion } from "@/lib/types";
import SuggestionCard from "@/components/SuggestionCard";
import PanelHeader from "@/components/PanelHeader";
import { fetchSuggestions } from "@/lib/suggest";
import { streamChatReply, formatChatError } from "@/lib/chat";

function formatClock(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function SuggestionsPanel() {
  const batches = useSession((s) => s.batches);
  const isRecording = useSession((s) => s.isRecording);
  const addBatch = useSession((s) => s.addBatch);
  const addChatMessage = useSession((s) => s.addChatMessage);
  const updateChatMessage = useSession((s) => s.updateChatMessage);

  const settings = useSettings((s) => s.settings);
  const hasApiKey = settings.apiKey.trim().length > 0;
  const refreshIntervalMs = settings.refreshIntervalMs;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(() => Math.round(refreshIntervalMs / 1000));
  const loadingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (loadingRef.current) return;
    if (!hasApiKey) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const batch = await fetchSuggestions();
      addBatch(batch);
      setSecondsLeft(Math.round(refreshIntervalMs / 1000));
    } catch (err) {
      console.error("fetchSuggestions failed", err);
      setError("Failed to fetch suggestions.");
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [hasApiKey, addBatch, refreshIntervalMs]);

  useEffect(() => {
    if (!isRecording || !hasApiKey) return;
    const id = setInterval(() => {
      refresh();
    }, refreshIntervalMs);
    return () => clearInterval(id);
  }, [isRecording, hasApiKey, refreshIntervalMs, refresh]);

  useEffect(() => {
    if (!isRecording || !hasApiKey) return;
    const id = setInterval(() => {
      setSecondsLeft((s) => (s <= 1 ? Math.round(refreshIntervalMs / 1000) : s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [isRecording, hasApiKey, refreshIntervalMs]);

  const handleCardClick = async (suggestion: Suggestion) => {
    const assistantId = crypto.randomUUID();
    addChatMessage({
      id: crypto.randomUUID(),
      role: "user",
      content: suggestion.title,
      createdAt: Date.now(),
      fromSuggestionId: suggestion.id,
    });
    addChatMessage({
      id: assistantId,
      role: "assistant",
      content: "",
      createdAt: Date.now(),
    });
    try {
      for await (const token of streamChatReply("", suggestion)) {
        updateChatMessage(assistantId, (prev) => prev + token);
      }
    } catch (err) {
      console.error("streamChatReply failed", err);
      const msg = formatChatError(err);
      updateChatMessage(assistantId, (prev) => prev + (prev ? "\n\n" : "") + msg);
    }
  };

  const rightLabel = batches.length === 0
    ? "0 BATCHES"
    : batches.length === 1
      ? "1 BATCH"
      : `${batches.length} BATCHES`;

  return (
    <section className="flex flex-col h-full min-h-0">
      <PanelHeader number={2} title="Live Suggestions" rightLabel={rightLabel} />

      <div className="px-5 py-3 flex items-center justify-between border-b border-slate-900">
        <button
          type="button"
          onClick={refresh}
          disabled={!hasApiKey || loading}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-slate-300 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <RotateCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>{loading ? "Reloading…" : "Reload suggestions"}</span>
        </button>
        <span className="text-[11px] text-slate-500 tabular-nums">
          {isRecording && hasApiKey
            ? `auto-refresh in ${secondsLeft}s`
            : "auto-refresh paused"}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {batches.length === 0 ? (
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-[13px] leading-relaxed text-slate-400">
            On reload (or auto every ~{Math.round(refreshIntervalMs / 1000)}s), generate{" "}
            <span className="text-slate-200 font-medium">3 fresh suggestions</span> from recent transcript context. New batch appears at the top; older batches push down (faded). Each is a tappable card: a{" "}
            <span className="text-sky-300">question to ask</span>, a{" "}
            <span className="text-violet-300">talking point</span>, an{" "}
            <span className="text-emerald-300">answer</span>, or a{" "}
            <span className="text-amber-300">fact-check</span>. The preview alone should already be useful.
          </div>
        ) : (
          batches.map((batch, idx) => (
            <div key={batch.id} className="space-y-2">
              {idx > 0 && (
                <div className="flex items-center gap-3 py-2">
                  <div className="flex-1 h-px bg-slate-800" />
                  <span className="text-[10px] uppercase tracking-[0.15em] text-slate-500 tabular-nums">
                    Batch {batches.length - idx} · {formatClock(batch.createdAt)}
                  </span>
                  <div className="flex-1 h-px bg-slate-800" />
                </div>
              )}
              <div className={idx > 1 ? "opacity-70" : ""}>
                <div className="space-y-2">
                  {batch.suggestions.map((s) => (
                    <SuggestionCard key={s.id} suggestion={s} onClick={handleCardClick} />
                  ))}
                </div>
              </div>
            </div>
          ))
        )}
        {error && (
          <p className="text-xs text-red-400 border border-red-500/30 bg-red-500/10 rounded-md px-2 py-1">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
