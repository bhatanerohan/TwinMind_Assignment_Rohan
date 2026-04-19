"use client";

import type { Suggestion, SuggestionKind } from "@/lib/types";

interface SuggestionCardProps {
  suggestion: Suggestion;
  onClick: (s: Suggestion) => void;
}

const KIND_LABEL: Record<SuggestionKind, string> = {
  answer: "ANSWER",
  question: "QUESTION TO ASK",
  "talking-point": "TALKING POINT",
  "fact-check": "FACT-CHECK",
  clarify: "CLARIFY",
};

const KIND_CLASS: Record<SuggestionKind, string> = {
  answer: "text-emerald-300 bg-emerald-400/10 ring-1 ring-inset ring-emerald-400/25",
  question: "text-sky-300 bg-sky-400/10 ring-1 ring-inset ring-sky-400/25",
  "talking-point": "text-violet-300 bg-violet-400/10 ring-1 ring-inset ring-violet-400/25",
  "fact-check": "text-amber-300 bg-amber-400/10 ring-1 ring-inset ring-amber-400/25",
  clarify: "text-rose-300 bg-rose-400/10 ring-1 ring-inset ring-rose-400/25",
};

export default function SuggestionCard({ suggestion, onClick }: SuggestionCardProps) {
  return (
    <button
      type="button"
      onClick={() => onClick(suggestion)}
      className="group w-full text-left rounded-xl border border-slate-800 bg-slate-900/40 hover:bg-slate-900/80 hover:border-slate-700 transition-colors p-4 space-y-2"
    >
      <span
        className={
          "inline-block px-2 py-0.5 rounded text-[10px] font-semibold tracking-[0.12em] " +
          KIND_CLASS[suggestion.kind]
        }
      >
        {KIND_LABEL[suggestion.kind]}
      </span>
      <h3 className="text-[14px] font-medium text-slate-100 leading-snug">
        {suggestion.title}
      </h3>
      {suggestion.preview && suggestion.preview !== suggestion.title && (
        <p className="text-[13px] text-slate-400 leading-relaxed">
          {suggestion.preview}
        </p>
      )}
    </button>
  );
}
