#!/usr/bin/env python3
"""Render narration with local Kokoro TTS (runs inside ~/kokoro-venv).

Reads the narration text from stdin, writes a 24 kHz mono WAV to --out.
Uses the local model snapshot only -- no HuggingFace downloads, no API key.

Env overrides:
  KOKORO_SNAPSHOT  dir holding kokoro-v1_0.pth, config.json, <voice>.pt
                   (default: ~/.cache/huggingface/hub/models--hexgrad--Kokoro-82M/snapshots/test)
"""
import argparse
import os
import sys

SNAPSHOT = os.environ.get(
    "KOKORO_SNAPSHOT",
    os.path.expanduser("~/.cache/huggingface/hub/models--hexgrad--Kokoro-82M/snapshots/test"),
)

# The snapshot is a hand-rolled layout (no HF refs/blobs), so point
# kokoro's hf_hub_download calls straight at the local files.
_FILES = {"config.json": "config.json", "kokoro-v1_0.pth": "kokoro-v1_0.pth"}


def _local_hf_hub_download(repo_id=None, filename=None, **kwargs):
    base = os.path.basename(filename or "")
    if base not in _FILES:
        raise RuntimeError(f"unexpected HF file request (offline): {filename}")
    path = os.path.join(SNAPSHOT, _FILES[base])
    if not os.path.exists(path):
        raise RuntimeError(f"Kokoro snapshot file missing: {path}")
    return path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="output .wav path")
    ap.add_argument("--voice", default="af_heart")
    ap.add_argument("--speed", type=float, default=1.1)
    ap.add_argument("--lang", default="a")
    args = ap.parse_args()

    text = sys.stdin.read().strip()
    if not text:
        raise SystemExit("kokoro_tts: no text on stdin")

    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"

    import kokoro.model
    import kokoro.pipeline
    kokoro.model.hf_hub_download = _local_hf_hub_download
    kokoro.pipeline.hf_hub_download = _local_hf_hub_download

    from kokoro import KPipeline
    import soundfile as sf
    import torch

    pipe = KPipeline(lang_code=args.lang, repo_id="hexgrad/Kokoro-82M", device="cpu")

    # voice may be a bare name (af_heart) or a .pt path; KPipeline accepts a
    # direct .pt path, which skips the HF voice download entirely.
    voice = args.voice
    if not voice.endswith(".pt"):
        cand = os.path.join(SNAPSHOT, voice + ".pt")
        if os.path.exists(cand):
            voice = cand

    chunks = [audio for _, _, audio in pipe(text, voice=voice, speed=args.speed)]
    if not chunks:
        raise SystemExit("kokoro_tts: pipeline produced no audio")
    wav = torch.cat(chunks, dim=0).numpy() if len(chunks) > 1 else chunks[0].numpy()

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    sf.write(args.out, wav, 24000)
    print(f"wrote {args.out} ({len(wav) / 24000:.1f}s)")


if __name__ == "__main__":
    main()
