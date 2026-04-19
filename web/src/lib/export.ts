import { suggestionById, useSession, useSettings } from "@/lib/store";
import type { SessionExport } from "@/lib/types";

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function timestampSlug(d: Date): string {
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

export function exportSession(): void {
  const session = useSession.getState();
  const { settings } = useSettings.getState();

  const exportedAt = new Date();
  const meta = session.sessionMeta;
  const data: SessionExport = {
    exportedAt: exportedAt.toISOString(),
    sessionStartedAt:
      session.sessionStartedAt !== null
        ? new Date(session.sessionStartedAt).toISOString()
        : null,
    userRole: settings.userRole,
    sessionMeta: {
      meetingType: meta.meetingType,
      meetingTypeConfidence: meta.meetingTypeConfidence,
      meetingTypeRationale: meta.meetingTypeRationale,
      classifiedAt:
        meta.classifiedAt !== null
          ? new Date(meta.classifiedAt).toISOString()
          : null,
    },
    transcript: session.transcript.map((c) => ({
      startedAt: new Date(c.startedAt).toISOString(),
      endedAt: new Date(c.endedAt).toISOString(),
      text: c.text,
      ...(c.speaker ? { speaker: c.speaker } : {}),
    })),
    batches: session.batches.map((b) => ({
      createdAt: new Date(b.createdAt).toISOString(),
      suggestions: b.suggestions.map((s) => ({
        kind: s.kind,
        title: s.title,
        preview: s.preview,
      })),
    })),
    chat: session.chat.map((m) => {
      const fromTitle = m.fromSuggestionId
        ? suggestionById(session.batches, m.fromSuggestionId)?.title
        : undefined;
      return {
        createdAt: new Date(m.createdAt).toISOString(),
        role: m.role,
        content: m.content,
        ...(fromTitle ? { fromSuggestionTitle: fromTitle } : {}),
      };
    }),
  };

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `twinmind-session-${timestampSlug(exportedAt)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
