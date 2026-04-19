export async function startRecording(opts: {
  intervalMs: number;
  onChunk: (blob: Blob, startedAt: number) => void;
}): Promise<() => void> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to access microphone: ${msg}`);
  }

  const preferredMime = "audio/webm;codecs=opus";
  const mimeType =
    typeof MediaRecorder !== "undefined" &&
    MediaRecorder.isTypeSupported(preferredMime)
      ? preferredMime
      : "";

  let currentRecorder: MediaRecorder | null = null;
  let currentStartedAt = 0;
  let stopped = false;

  const buildOptions = (): MediaRecorderOptions | undefined =>
    mimeType ? { mimeType } : undefined;

  const startOne = () => {
    if (stopped) return;
    const options = buildOptions();
    const recorder = options
      ? new MediaRecorder(stream, options)
      : new MediaRecorder(stream);
    const startedAt = Date.now();
    const chunks: Blob[] = [];

    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data && event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    recorder.onstop = () => {
      if (chunks.length === 0) return;
      const type = mimeType || chunks[0].type || "audio/webm";
      const blob = new Blob(chunks, { type });
      try {
        opts.onChunk(blob, startedAt);
      } catch {
        // swallow consumer errors so the recorder keeps rotating
      }
    };

    currentRecorder = recorder;
    currentStartedAt = startedAt;
    recorder.start();
  };

  const rotate = () => {
    const prev = currentRecorder;
    startOne();
    if (prev && prev.state !== "inactive") {
      try {
        prev.stop();
      } catch {
        // ignore
      }
    }
  };

  startOne();
  void currentStartedAt;

  const intervalId = setInterval(rotate, opts.intervalMs);

  return () => {
    if (stopped) return;
    stopped = true;
    clearInterval(intervalId);
    if (currentRecorder && currentRecorder.state !== "inactive") {
      try {
        currentRecorder.stop();
      } catch {
        // ignore
      }
    }
    for (const track of stream.getTracks()) {
      try {
        track.stop();
      } catch {
        // ignore
      }
    }
  };
}
