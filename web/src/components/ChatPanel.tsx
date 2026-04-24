"use client";

import { useEffect, useRef, useState } from "react";
import { useSession, useSettings } from "@/lib/store";
import { streamChatReply, formatChatError } from "@/lib/chat";
import { appendBufferedStream } from "@/lib/streamBuffer";
import PanelHeader from "@/components/PanelHeader";
import MarkdownMessage from "@/components/MarkdownMessage";

export default function ChatPanel() {
  const chat = useSession((s) => s.chat);
  const addChatMessage = useSession((s) => s.addChatMessage);
  const updateChatMessage = useSession((s) => s.updateChatMessage);

  const settings = useSettings((s) => s.settings);
  const hasApiKey = settings.apiKey.trim().length > 0;

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [chat]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const submit = async () => {
    const text = input.trim();
    if (!text || sending || !hasApiKey) return;
    setInput("");
    setSending(true);
    const assistantId = crypto.randomUUID();
    addChatMessage({
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      createdAt: Date.now(),
    });
    addChatMessage({
      id: assistantId,
      role: "assistant",
      content: "",
      createdAt: Date.now(),
    });
    try {
      await appendBufferedStream(streamChatReply(text), (chunk) =>
        updateChatMessage(assistantId, (prev) => prev + chunk),
      );
    } catch (err) {
      console.error("streamChatReply failed", err);
      const msg = formatChatError(err);
      updateChatMessage(assistantId, (prev) => prev + (prev ? "\n\n" : "") + msg);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <section className="flex flex-col h-full min-h-0">
      <PanelHeader number={3} title="Chat (Detailed Answers)" rightLabel="SESSION-ONLY" />

      <div ref={listRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {chat.length === 0 ? (
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-[13px] leading-relaxed text-slate-400">
            Click a suggestion in the middle column, or type a question below. Replies use a separate, longer-form prompt with full transcript context and stream as they generate.
          </div>
        ) : (
          chat.map((m) => (
            <div key={m.id} className="space-y-1.5">
              <div className="text-[10px] font-semibold tracking-[0.15em] text-slate-500">
                {m.role === "user" ? "YOU" : "ASSISTANT"}
              </div>
              {m.role === "user" ? (
                <div className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-[14px] text-slate-100 whitespace-pre-wrap leading-relaxed">
                  {m.content}
                </div>
              ) : m.content ? (
                <MarkdownMessage content={m.content} />
              ) : (
                <div className="inline-flex items-center gap-1 text-slate-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-500 animate-pulse" />
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-500 animate-pulse [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-500 animate-pulse [animation-delay:300ms]" />
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="border-t border-slate-800 px-5 py-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={!hasApiKey || sending}
            placeholder={hasApiKey ? "Ask anything…" : "Set API key in Settings to chat."}
            className="flex-1 resize-none rounded-md border border-slate-800 bg-slate-900 text-slate-100 placeholder-slate-500 px-3 py-2 text-[14px] focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500/40 disabled:opacity-60 min-h-[38px] max-h-40"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!hasApiKey || sending || input.trim().length === 0}
            className="inline-flex items-center justify-center h-[38px] px-4 rounded-md bg-sky-500 hover:bg-sky-400 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </section>
  );
}
