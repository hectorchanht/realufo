#!/usr/bin/env python3
"""Word-level timestamps for a narration WAV using local faster-whisper (runs inside ~/kokoro-venv).

Reads the audio path from argv[1]; prints a JSON list of [text, start, end] to stdout.
Fully offline: the model dir is passed as a local path (no HF downloads) and
HF_HUB_OFFLINE=1 blocks the tokenizer fallback fetch.

Env overrides:
  WHISPER_MODEL  dir holding model.bin, config.json, tokenizer.json
                 (default: ~/whisper-models/base.en)
"""
import json
import os
import sys
import wave

import numpy as np

MODEL_DIR = os.environ.get(
    "WHISPER_MODEL",
    os.path.expanduser("~/whisper-models/base.en"),
)

os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"


def _read_wav_mono_16k(path):
    """Read any PCM WAV with stdlib wave → float32 mono @16 kHz (what the
    feature extractor expects). Avoids the PyAV decode path entirely."""
    with wave.open(path, "rb") as w:
        nch, sw, sr, n = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
        raw = w.readframes(n)
    if sw == 2:
        pcm = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    elif sw == 4:
        pcm = np.frombuffer(raw, dtype=np.int32).astype(np.float32) / 2147483648.0
    else:
        raise SystemExit(f"whisper_words: unsupported sample width {sw} in {path}")
    pcm = pcm.reshape(-1, nch).mean(axis=1)  # mono
    if sr != 16000:  # linear resample to 16 kHz
        idx = np.linspace(0, len(pcm) - 1, int(round(len(pcm) * 16000 / sr)))
        pcm = np.interp(idx, np.arange(len(pcm)), pcm).astype(np.float32)
    return pcm


def main():
    audio = sys.argv[1]
    if not os.path.exists(audio):
        raise SystemExit(f"whisper_words: audio not found: {audio}")
    for f in ("model.bin", "config.json", "tokenizer.json"):
        if not os.path.exists(os.path.join(MODEL_DIR, f)):
            raise SystemExit(f"whisper_words: model file missing: {os.path.join(MODEL_DIR, f)}")

    from faster_whisper import WhisperModel

    model = WhisperModel(MODEL_DIR, device="cpu", compute_type="int8")
    audio = _read_wav_mono_16k(audio)
    segments, _ = model.transcribe(audio, language="en", word_timestamps=True)

    out = []
    for seg in segments:
        for w in (seg.words or []):
            text = (w.word or "").strip()
            if text:
                out.append([text, round(w.start, 3), round(w.end, 3)])
    print(json.dumps(out))


if __name__ == "__main__":
    main()
