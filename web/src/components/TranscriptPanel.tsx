"use client";

import { useEffect, useRef, useState } from "react";
import { useSession, useSettings } from "@/lib/store";
import { startRecording } from "@/lib/recorder";
import { uploadChunk } from "@/lib/transcribe";
import PanelHeader from "@/components/PanelHeader";

function formatClock(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function TranscriptPanel() {
  const transcript = useSession((s) => s.transcript);
  const isRecording = useSession((s) => s.isRecording);
  const setRecording = useSession((s) => s.setRecording);
  const addTranscriptChunk = useSession((s) => s.addTranscriptChunk);
  const settings = useSettings((s) => s.settings);
  const hasApiKey = settings.apiKey.trim().length > 0;
  const chunkIntervalMs = settings.chunkIntervalMs;

  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [transcript.length]);

  useEffect(() => {
    return () => {
      if (stopRef.current) {
        try {
          stopRef.current();
        } catch {}
        stopRef.current = null;
      }
    };
  }, []);

  const handleStart = async () => {
    setError(null);
    setStarting(true);
    try {
      const stop = await startRecording({
        intervalMs: chunkIntervalMs,
        onChunk: async (blob: Blob) => {
          const startedAt = Date.now() - chunkIntervalMs;
          try {
            const chunk = await uploadChunk(blob, startedAt);
            if (chunk.text.length === 0) return;
            addTranscriptChunk(chunk);
          } catch (err) {
            console.error("uploadChunk failed", err);
            setError("Failed to transcribe chunk.");
          }
        },
      });
      stopRef.current = stop;
      setRecording(true);
    } catch (err) {
      console.error("startRecording failed", err);
      setError("Could not start recording. Check microphone permissions.");
    } finally {
      setStarting(false);
    }
  };

  const handleStop = () => {
    if (stopRef.current) {
      try {
        stopRef.current();
      } catch (err) {
        console.error("stop failed", err);
      }
      stopRef.current = null;
    }
    setRecording(false);
  };

  const toggle = () => {
    if (isRecording) handleStop();
    else handleStart();
  };

  const statusLabel = !hasApiKey
    ? "NO KEY"
    : isRecording
      ? "LIVE"
      : transcript.length > 0
        ? "PAUSED"
        : "IDLE";
  const statusTone: "muted" | "warn" | "ok" =
    !hasApiKey ? "warn" : isRecording ? "ok" : "muted";

  return (
    <section className="flex flex-col h-full min-h-0">
      <PanelHeader number={1} title="Mic & Transcript" rightLabel={statusLabel} rightTone={statusTone} />

      <div className="px-5 py-4">
        <button
          type="button"
          onClick={toggle}
          disabled={!hasApiKey || starting}
          className="group flex items-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label={isRecording ? "Stop recording" : "Start recording"}
        >
          <span
            className={
              "relative flex items-center justify-center h-11 w-11 rounded-full transition-all " +
              (isRecording
                ? "bg-red-500/15 ring-2 ring-red-500/60"
                : "bg-sky-500/15 ring-2 ring-sky-500/60 group-hover:ring-sky-400")
            }
          >
            {isRecording ? (
              <span className="absolute inset-0 rounded-full bg-red-500/10 animate-ping" />
            ) : null}
            <span
              className={
                "relative block rounded-full " +
                (isRecording ? "h-3 w-3 bg-red-400" : "h-3 w-3 bg-sky-400")
              }
            />
          </span>
          <span className="text-sm text-slate-300 text-left leading-tight">
            {starting
              ? "Starting…"
              : isRecording
                ? <>Recording. <span className="text-slate-500">Click to stop.</span></>
                : transcript.length > 0
                  ? <>Stopped. <span className="text-slate-500">Click to resume.</span></>
                  : !hasApiKey
                    ? <span className="text-slate-500">Set API key in Settings to start.</span>
                    : <>Click to start recording.</>}
          </span>
        </button>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto px-5 pb-5 space-y-3">
        {transcript.length === 0 ? (
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-[13px] leading-relaxed text-slate-400">
            The transcript scrolls and appends new chunks every ~{Math.round(chunkIntervalMs / 1000)} seconds while recording. Use the mic button above to start/stop. An export button is available in the header to pull the full session.
          </div>
        ) : (
          transcript.map((chunk) => {
            const speakerLabel =
              chunk.speaker === "user"
                ? { text: "YOU", cls: "text-sky-300 bg-sky-400/10 ring-sky-400/25" }
                : chunk.speaker === "other"
                  ? { text: "OTHER", cls: "text-violet-300 bg-violet-400/10 ring-violet-400/25" }
                  : null;
            return (
              <p key={chunk.id} className="text-[14px] leading-relaxed text-slate-200">
                <span className="text-[11px] text-slate-500 tabular-nums mr-2 align-baseline">
                  {formatClock(chunk.startedAt)}
                </span>
                {speakerLabel && (
                  <span
                    className={
                      "inline-block mr-2 px-1.5 py-0 rounded text-[10px] font-semibold tracking-[0.12em] ring-1 ring-inset align-baseline " +
                      speakerLabel.cls
                    }
                  >
                    {speakerLabel.text}
                  </span>
                )}
                {chunk.text}
              </p>
            );
          })
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
