interface PanelHeaderProps {
  number: number;
  title: string;
  rightLabel?: string;
  rightTone?: "default" | "muted" | "warn" | "ok";
}

const toneClass: Record<NonNullable<PanelHeaderProps["rightTone"]>, string> = {
  default: "text-slate-400",
  muted: "text-slate-500",
  warn: "text-amber-400",
  ok: "text-emerald-400",
};

export default function PanelHeader({ number, title, rightLabel, rightTone = "muted" }: PanelHeaderProps) {
  return (
    <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[10px] font-semibold tracking-[0.15em] text-slate-500 tabular-nums">
          {number}.
        </span>
        <h2 className="text-[10px] font-semibold tracking-[0.15em] text-slate-300 uppercase truncate">
          {title}
        </h2>
      </div>
      {rightLabel && (
        <span className={`text-[10px] font-semibold tracking-[0.15em] uppercase tabular-nums ${toneClass[rightTone]}`}>
          {rightLabel}
        </span>
      )}
    </div>
  );
}
