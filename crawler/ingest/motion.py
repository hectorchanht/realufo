"""Motion score for RealUFO Shorts: how much the FIRST FEW FRAMES move.

The feed's "Short clips" carousel autoplays each card muted + looping while
it's on screen, so a clip that opens on a static title card looks dead.
score_frames() samples the first ~2 s (8 fps, 160 px wide grayscale) and
returns the mean absolute inter-frame difference: 0 = static card, high =
moving video. Scores feed db/migrations/0042 short_motion.

Used by scripts/short_motion.py (backfill + one-off scoring) and by
crawler/ingest/clips.py (scores each rendered vertical twin at render time).
"""
import subprocess

FPS = 8        # frames per second sampled
SECONDS = 2.0  # window at the head of the clip
WIDTH = 160    # downscale width (keeps the diff cheap and noise-low)


def score_frames(path: str, fps: int = FPS, seconds: float = SECONDS,
                 width: int = WIDTH) -> tuple[float, int]:
    """Return (motion, frames_analyzed) for the first `seconds` of a local
    file or remote URL. Raises RuntimeError when ffmpeg is missing, numpy is
    missing, or the decode yields fewer than 2 frames."""
    import numpy as np  # lazy: keep this module importable without numpy
    raw = subprocess.run(
        ["ffmpeg", "-v", "error",
         "-ss", "0", "-t", f"{seconds}", "-i", path,
         "-vf", f"fps={fps},scale={width}:-2,format=gray",
         "-f", "rawvideo", "-"],
        capture_output=True, timeout=180).stdout
    n = int(fps * seconds)
    if len(raw) < width * n:  # short/failed decode: use what we got
        n = len(raw) // width
    if n < 2:
        raise RuntimeError(f"only {len(raw)} bytes decoded from {path}")
    h = len(raw) // (n * width)
    a = np.frombuffer(raw[:n * h * width], dtype=np.uint8) \
        .reshape(n, h, width).astype(np.float32)
    return round(float(abs(np.diff(a, axis=0)).mean()), 2), n
