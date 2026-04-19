"""
Interactive sanity-check for a Groq API key.
Lists models, verifies chat + whisper endpoints, then drops you into an
interactive loop where you can record your voice or type a chat message.

Setup:
    pip install -r scripts/requirements.txt        # sounddevice + numpy
    Put your key in scripts/.env as:  GROQ_API_KEY=gsk_...

Run:
    python scripts/test_groq.py                    # interactive menu
    python scripts/test_groq.py path/to/audio.m4a  # one-shot: transcribe a file

Env var also works (takes precedence over .env):
    PowerShell:  $env:GROQ_API_KEY = "gsk_..."
    Git Bash:    export GROQ_API_KEY="gsk_..."
    cmd:         set GROQ_API_KEY=gsk_...
"""

import io
import json
import math
import os
import struct
import sys
import time
import uuid
import wave
import urllib.request
import urllib.error
from pathlib import Path


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


load_dotenv(Path(__file__).parent / ".env")

API_KEY = os.environ.get("GROQ_API_KEY", "").strip()
BASE = "https://api.groq.com/openai/v1"
SAMPLE_RATE = 16000


CONTENT_TYPES = {
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".mp4": "audio/mp4",
    ".mpeg": "audio/mpeg",
    ".mpga": "audio/mpeg",
    ".webm": "audio/webm",
    ".flac": "audio/flac",
    ".ogg": "audio/ogg",
}


def request(method: str, path: str, body: dict | None = None) -> tuple[dict, dict]:
    data = json.dumps(body).encode() if body else None
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "User-Agent": "twinmind-assignment/0.1",
    }
    if body:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(f"{BASE}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read()), dict(r.headers)
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}: {e.read().decode()}")
        sys.exit(1)


def make_test_wav() -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        frames = bytearray()
        for i in range(SAMPLE_RATE):
            sample = int(32767 * 0.2 * math.sin(2 * math.pi * 440 * i / SAMPLE_RATE))
            frames += struct.pack("<h", sample)
        w.writeframes(bytes(frames))
    return buf.getvalue()


def record_wav(seconds: float) -> bytes:
    import sounddevice as sd  # lazy import so --help works without deps
    import numpy as np

    print(f"  [recording {seconds:.1f}s] 3..", end="", flush=True); time.sleep(1)
    print("2..", end="", flush=True); time.sleep(1)
    print("1..", end="", flush=True); time.sleep(1)
    print(" GO — speak now")
    audio = sd.rec(int(seconds * SAMPLE_RATE), samplerate=SAMPLE_RATE, channels=1, dtype="int16")
    sd.wait()
    print("  [captured]")
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes(np.asarray(audio, dtype=np.int16).tobytes())
    return buf.getvalue()


def transcribe(audio_bytes: bytes, filename: str = "test.wav") -> tuple[dict, dict]:
    ext = Path(filename).suffix.lower()
    content_type = CONTENT_TYPES.get(ext, "application/octet-stream")
    boundary = uuid.uuid4().hex
    parts: list[bytes] = []
    parts.append(f"--{boundary}\r\n".encode())
    parts.append(f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'.encode())
    parts.append(f"Content-Type: {content_type}\r\n\r\n".encode())
    parts.append(audio_bytes)
    parts.append(b"\r\n")
    parts.append(f"--{boundary}\r\n".encode())
    parts.append(b'Content-Disposition: form-data; name="model"\r\n\r\n')
    parts.append(b"whisper-large-v3\r\n")
    parts.append(f"--{boundary}--\r\n".encode())
    body = b"".join(parts)

    req = urllib.request.Request(
        f"{BASE}/audio/transcriptions",
        data=body,
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "User-Agent": "twinmind-assignment/0.1",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read()), dict(r.headers)
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}: {e.read().decode()}")
        return {"text": ""}, {}


def chat_turn(history: list[dict], user_text: str) -> str:
    history.append({"role": "user", "content": user_text})
    resp, _ = request("POST", "/chat/completions", {
        "model": "openai/gpt-oss-120b",
        "messages": history,
        "max_tokens": 800,
        "reasoning_effort": "low",
    })
    reply = resp["choices"][0]["message"]["content"]
    history.append({"role": "assistant", "content": reply})
    return reply


def startup_check() -> None:
    print("== Models available ==")
    models, _ = request("GET", "/models")
    ids = {m["id"] for m in models["data"]}
    for mid in sorted(ids):
        marker = "  <-- required" if mid in ("whisper-large-v3", "openai/gpt-oss-120b") else ""
        print(f"  {mid}{marker}")
    ok = "openai/gpt-oss-120b" in ids and "whisper-large-v3" in ids
    print("  ->", "both required models present" if ok else "WARNING: required model missing")

    print("\n== Chat smoke test ==")
    chat, headers = request("POST", "/chat/completions", {
        "model": "openai/gpt-oss-120b",
        "messages": [{"role": "user", "content": "Reply with exactly: TwinMind check OK"}],
        "max_tokens": 100,
        "reasoning_effort": "low",
    })
    print(f"  reply:  {chat['choices'][0]['message']['content']!r}")
    print(f"  t:      {chat['usage']['total_time']*1000:.0f} ms, {chat['usage']['total_tokens']} tokens")
    for k, v in headers.items():
        if k.lower() in ("x-ratelimit-limit-tokens", "x-ratelimit-remaining-tokens"):
            print(f"  {k}: {v}")


def one_shot_transcribe(audio_arg: str) -> None:
    audio_path = Path(audio_arg).expanduser()
    if not audio_path.is_file():
        print(f"ERROR: file not found: {audio_path}"); sys.exit(1)
    if audio_path.suffix.lower() not in CONTENT_TYPES:
        print(f"ERROR: unsupported extension {audio_path.suffix!r}. Allowed: {sorted(CONTENT_TYPES)}"); sys.exit(1)
    audio_bytes = audio_path.read_bytes()
    print(f"\n== Transcribing {audio_path.name} ({len(audio_bytes):,} bytes) ==")
    tr, _ = transcribe(audio_bytes, filename=audio_path.name)
    print(f"  text: {tr.get('text', '').strip()}")


def interactive_loop() -> None:
    print("\n== Interactive mode ==")
    print("  r = record voice & transcribe    c = chat message    q = quit\n")
    history: list[dict] = []
    while True:
        try:
            choice = input("> ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            print(); break
        if not choice:
            continue
        if choice.startswith("q"):
            break
        elif choice.startswith("r"):
            dur_raw = input("  seconds to record (default 5): ").strip() or "5"
            try:
                dur = float(dur_raw)
            except ValueError:
                print("  bad number"); continue
            if dur <= 0 or dur > 60:
                print("  pick 1-60 seconds"); continue
            try:
                wav = record_wav(dur)
            except Exception as e:
                print(f"  recording failed: {e}"); continue
            t0 = time.time()
            tr, _ = transcribe(wav, filename="mic.wav")
            print(f"  transcript ({(time.time()-t0)*1000:.0f} ms): {tr.get('text', '').strip() or '<empty>'}")
        elif choice.startswith("c"):
            text = input("  you: ").strip()
            if not text:
                continue
            t0 = time.time()
            reply = chat_turn(history, text)
            print(f"  assistant ({(time.time()-t0)*1000:.0f} ms): {reply}\n")
        else:
            print("  choose r, c, or q")
    print("bye.")


def main() -> None:
    if not API_KEY or not API_KEY.startswith("gsk_"):
        print("GROQ_API_KEY missing or malformed. Set it in scripts/.env or as an env var.")
        sys.exit(1)

    startup_check()

    if len(sys.argv) > 1:
        one_shot_transcribe(sys.argv[1])
        return

    interactive_loop()


if __name__ == "__main__":
    main()
