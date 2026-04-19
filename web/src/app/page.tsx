"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import TranscriptPanel from "@/components/TranscriptPanel";
import SuggestionsPanel from "@/components/SuggestionsPanel";
import ChatPanel from "@/components/ChatPanel";
import SettingsDialog from "@/components/SettingsDialog";

export default function Home() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex flex-col flex-1 h-full min-h-0 bg-slate-950 text-slate-200 overflow-hidden">
        <div className="flex-1 flex items-center justify-center text-sm text-slate-500">
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 h-full min-h-0 bg-slate-950 text-slate-200 overflow-hidden">
      <Header onOpenSettings={() => setSettingsOpen(true)} />
      <main className="flex-1 grid grid-cols-[1fr_1fr_1fr] gap-3 p-3 min-h-0 overflow-hidden">
        <div className="min-h-0 min-w-0 rounded-xl border border-slate-800 bg-slate-950 overflow-hidden">
          <TranscriptPanel />
        </div>
        <div className="min-h-0 min-w-0 rounded-xl border border-slate-800 bg-slate-950 overflow-hidden">
          <SuggestionsPanel />
        </div>
        <div className="min-h-0 min-w-0 rounded-xl border border-slate-800 bg-slate-950 overflow-hidden">
          <ChatPanel />
        </div>
      </main>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
