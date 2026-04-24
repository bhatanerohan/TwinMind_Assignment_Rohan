import { suggestionById, useSession } from "@/lib/store";
import type { SessionExport } from "@/lib/types";

export type SessionExportFormat = "json" | "text";

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function timestampSlug(d: Date): string {
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

export function exportSession(format: SessionExportFormat = "json"): void {
  const exportedAt = new Date();
  const data = buildSessionExport(exportedAt);

  if (format === "text") {
    downloadFile(
      renderTextSession(data),
      `twinmind-session-${timestampSlug(exportedAt)}.txt`,
      "text/plain;charset=utf-8",
    );
    return;
  }

  downloadFile(
    JSON.stringify(data, null, 2),
    `twinmind-session-${timestampSlug(exportedAt)}.json`,
    "application/json",
  );
}

function buildSessionExport(exportedAt: Date): SessionExport {
  const session = useSession.getState();

  const meta = session.sessionMeta;
  return {
    exportedAt: exportedAt.toISOString(),
    sessionStartedAt:
      session.sessionStartedAt !== null
        ? new Date(session.sessionStartedAt).toISOString()
        : null,
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
}

function downloadFile(content: string, filename: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function renderTextSession(data: SessionExport): string {
  const lines: string[] = [];

  lines.push("TwinMind Session Export");
  lines.push(`Exported: ${data.exportedAt}`);
  lines.push(`Session started: ${data.sessionStartedAt ?? "unknown"}`);
  lines.push(
    `Meeting type: ${data.sessionMeta.meetingType} (${Math.round(
      data.sessionMeta.meetingTypeConfidence * 100,
    )}% confidence)`,
  );
  if (data.sessionMeta.meetingTypeRationale) {
    lines.push(`Meeting rationale: ${data.sessionMeta.meetingTypeRationale}`);
  }

  lines.push("");
  lines.push("Transcript");
  lines.push("----------");
  if (data.transcript.length === 0) {
    lines.push("(none)");
  } else {
    for (const chunk of data.transcript) {
      const speaker = chunk.speaker ? ` [${chunk.speaker.toUpperCase()}]` : "";
      lines.push(`[${chunk.startedAt} - ${chunk.endedAt}]${speaker} ${chunk.text}`);
    }
  }

  lines.push("");
  lines.push("Suggestion Batches");
  lines.push("------------------");
  if (data.batches.length === 0) {
    lines.push("(none)");
  } else {
    data.batches.forEach((batch, batchIndex) => {
      lines.push(`Batch ${data.batches.length - batchIndex} - ${batch.createdAt}`);
      batch.suggestions.forEach((suggestion, suggestionIndex) => {
        lines.push(
          `${suggestionIndex + 1}. [${suggestion.kind}] ${suggestion.title}`,
        );
        lines.push(`   ${suggestion.preview}`);
      });
      lines.push("");
    });
  }

  lines.push("Chat");
  lines.push("----");
  if (data.chat.length === 0) {
    lines.push("(none)");
  } else {
    for (const message of data.chat) {
      const source = message.fromSuggestionTitle
        ? ` (from suggestion: ${message.fromSuggestionTitle})`
        : "";
      lines.push(`[${message.createdAt}] ${message.role.toUpperCase()}${source}`);
      lines.push(message.content || "(empty)");
      lines.push("");
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}
