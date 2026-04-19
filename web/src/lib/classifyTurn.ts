import { useSession, useSettings } from "@/lib/store";
import type { Speaker } from "@/lib/types";

interface ClassifyTurnResponse {
  speaker: Speaker;
  confidence: number;
}

export async function classifyTurn(
  chunkId: string,
  currentText: string,
): Promise<ClassifyTurnResponse | null> {
  const { settings } = useSettings.getState();
  if (!settings.apiKey || settings.userRole === "unknown") return null;

  const session = useSession.getState();
  const previousTurns = session.transcript
    .filter((c) => c.id !== chunkId && (c.speaker === "user" || c.speaker === "other"))
    .slice(-4)
    .map((c) => ({ text: c.text, speaker: c.speaker as Speaker }));

  try {
    const res = await fetch("/api/classify-turn", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-groq-key": settings.apiKey,
      },
      body: JSON.stringify({
        model: settings.chatModel,
        userRole: settings.userRole,
        currentText,
        previousTurns,
      }),
    });

    if (!res.ok) {
      console.error("classifyTurn non-ok:", res.status);
      return null;
    }

    return (await res.json()) as ClassifyTurnResponse;
  } catch (err) {
    console.error("classifyTurn failed:", err);
    return null;
  }
}
