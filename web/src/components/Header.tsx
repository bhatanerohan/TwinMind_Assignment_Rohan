"use client";

import { useEffect, useState } from "react";
import { Download, FileText, Settings } from "lucide-react";
import { useSession } from "@/lib/store";
import { exportSession } from "@/lib/export";

interface HeaderProps {
  onOpenSettings: () => void;
}

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function Header({ onOpenSettings }: HeaderProps) {
  const isRecording = useSession((s) => s.isRecording);
  const sessionStartedAt = useSession((s) => s.sessionStartedAt);
  const transcript = useSession((s) => s.transcript);
  const batches = useSession((s) => s.batches);
  const chat = useSession((s) => s.chat);

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isRecording) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isRecording]);

  const elapsed =
    isRecording && sessionStartedAt ? formatElapsed(now - sessionStartedAt) : null;

  const exportDisabled =
    transcript.length === 0 && batches.length === 0 && chat.length === 0;

  const handleExportJson = () => {
    try {
      exportSession("json");
    } catch (err) {
      console.error("Export failed", err);
    }
  };

  const handleExportText = () => {
    try {
      exportSession("text");
    } catch (err) {
      console.error("Export failed", err);
    }
  };

  return (
    <header className="flex items-center justify-between px-5 h-12 border-b border-slate-800 bg-slate-950">
      <div className="flex items-center gap-3 min-w-0">
        <h1 className="text-sm font-semibold tracking-tight text-slate-100 truncate">
          TwinMind <span className="text-slate-500 font-normal">— Live Suggestions</span>
        </h1>
        {isRecording && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-red-500/10 text-red-400 border border-red-500/20">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
            </span>
            <span className="text-[11px] font-medium tabular-nums tracking-wide">
              REC {elapsed}
            </span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={handleExportJson}
          disabled={exportDisabled}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-slate-300 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="Export session as JSON"
        >
          <Download className="h-3.5 w-3.5" />
          <span>JSON</span>
        </button>
        <button
          type="button"
          onClick={handleExportText}
          disabled={exportDisabled}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-slate-300 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="Export session as plain text"
        >
          <FileText className="h-3.5 w-3.5" />
          <span>TXT</span>
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          className="inline-flex items-center justify-center p-1.5 rounded-md text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition-colors"
          title="Settings"
          aria-label="Settings"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
