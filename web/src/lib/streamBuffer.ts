const DEFAULT_FLUSH_MS = 60;
const DEFAULT_MIN_CHARS = 120;

export async function appendBufferedStream(
  stream: AsyncGenerator<string>,
  onChunk: (chunk: string) => void,
  options: { flushMs?: number; minChars?: number } = {},
): Promise<void> {
  const flushMs = options.flushMs ?? DEFAULT_FLUSH_MS;
  const minChars = options.minChars ?? DEFAULT_MIN_CHARS;

  let pending = "";
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (pending.length === 0) return;
    const chunk = pending;
    pending = "";
    onChunk(chunk);
  };

  const scheduleFlush = () => {
    if (timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      flush();
    }, flushMs);
  };

  try {
    for await (const token of stream) {
      pending += token;
      if (pending.length >= minChars) {
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
        flush();
      } else {
        scheduleFlush();
      }
    }
  } finally {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    flush();
  }
}
