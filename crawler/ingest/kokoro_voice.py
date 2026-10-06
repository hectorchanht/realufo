"""Kokoro narration for batch clips (crawler/ingest/clips.py --vertical).

Same house voice as the handmade showcase clips (showcase/lib.py): af_heart @ 1.1x.
Two environments, one contract:

- This VM: KOKORO_SNAPSHOT holds the hand-rolled local snapshot (no HF refs/blobs),
  so hf_hub_download is pointed straight at the local files — same trick as
  showcase/kokoro_tts.py. Runs inside a python with kokoro installed (~/kokoro-venv).
- GitHub Actions: no snapshot; KPipeline downloads hexgrad/Kokoro-82M from the Hub
  (cache ~/.cache/huggingface in the workflow).

narration_wav(text, cache_dir) -> wav path, or None on ANY failure. A TTS failure
must never fail a clip render — the clip simply ships without voiceover.
"""
import hashlib
import os

VOICE = os.environ.get("KOKORO_VOICE", "af_heart")
SPEED = float(os.environ.get("KOKORO_SPEED", "1.1"))
SNAPSHOT = os.environ.get(
    "KOKORO_SNAPSHOT",
    os.path.expanduser("~/.cache/huggingface/hub/models--hexgrad--Kokoro-82M/snapshots/test"),
)
_FILES = {"config.json": "config.json", "kokoro-v1_0.pth": "kokoro-v1_0.pth"}


def _local_hf_hub_download(repo_id=None, filename=None, **kwargs):
    base = os.path.basename(filename or "")
    if base not in _FILES:
        raise RuntimeError(f"unexpected HF file request (offline): {filename}")
    path = os.path.join(SNAPSHOT, _FILES[base])
    if not os.path.exists(path):
        raise RuntimeError(f"Kokoro snapshot file missing: {path}")
    return path


def _pipe():
    """KPipeline, preferring the local snapshot when present (this VM)."""
    use_local = all(os.path.exists(os.path.join(SNAPSHOT, f)) for f in _FILES.values())
    if use_local:
        os.environ["HF_HUB_OFFLINE"] = "1"
        os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
        import kokoro.model
        import kokoro.pipeline

        kokoro.model.hf_hub_download = _local_hf_hub_download
        kokoro.pipeline.hf_hub_download = _local_hf_hub_download
    from kokoro import KPipeline

    pipe = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M", device="cpu")
    voice = VOICE
    if not voice.endswith(".pt"):
        cand = os.path.join(SNAPSHOT, voice + ".pt")
        if os.path.exists(cand):
            voice = cand  # direct .pt path: skips the HF voice download entirely
    return pipe, voice


def narration_wav(text, cache_dir):
    """Render `text` to a 24 kHz mono WAV, cached by text+voice+speed. None on failure."""
    text = (text or "").strip()
    if not text:
        return None
    os.makedirs(cache_dir, exist_ok=True)
    out = os.path.join(
        cache_dir, "kokoro-" + hashlib.sha1(f"{VOICE}|{SPEED}|{text}".encode()).hexdigest()[:16] + ".wav"
    )
    if os.path.exists(out):
        return out
    try:
        pipe, voice = _pipe()
        chunks = [audio for _, _, audio in pipe(text, voice=voice, speed=SPEED)]
        if not chunks:
            return None
        import torch
        import soundfile as sf

        wav = torch.cat(chunks, dim=0).numpy() if len(chunks) > 1 else chunks[0].numpy()
        sf.write(out, wav, 24000)
        return out
    except Exception as e:  # noqa: BLE001 - voiceover is best-effort by contract
        print(f"kokoro voice SKIP: {str(e)[:200]}")
        return None
