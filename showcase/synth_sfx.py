#!/usr/bin/env python3
"""Synthesize a simple sound effect locally (runs inside ~/kokoro-venv; numpy only).

Reads the text prompt from stdin; writes a 44.1 kHz mono WAV to --out, exactly
--seconds long. No API, no network.

Keyword-driven:
  tick/click/pen/snap/tap ..... crisp transient click (effect at t=0, then silence)
  whoosh/flyby/zoom/rush/swish/wind/air/pass .. filtered-noise swell
  impact/thud/boom/thump/explosion/hit/crash ... low thump
  anything else ................ soft airy bed

Synthesis is deterministic per prompt text (seeded RNG), and lib.sfx() caches
by prompt+seconds anyway.
"""
import argparse
import hashlib
import sys
import wave

import numpy as np

SR = 44100


def _write_wav(path, samples):
    peak = np.max(np.abs(samples))
    if peak > 0:
        samples = samples / peak * 0.8
    pcm = (np.clip(samples, -1.0, 1.0) * 32767).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def _lowpass_sweep(x, cutoff):
    """One-pole lowpass with per-sample cutoff (Hz), cutoff as array."""
    a = 1.0 - np.exp(-2.0 * np.pi * np.asarray(cutoff, dtype=np.float64) / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc += a[i] * (x[i] - acc)
        y[i] = acc
    return y


def _tick(n, rng):
    y = np.zeros(n)
    bl = int(0.004 * SR)  # 4 ms noise burst = the "click"
    burst = rng.standard_normal(bl) * np.exp(-np.arange(bl) / (bl / 4.0))
    y[:bl] = burst
    pl = int(0.09 * SR)  # damped 2.6 kHz ping = the "pen on paper" body
    t = np.arange(pl) / SR
    y[:pl] += 0.5 * np.sin(2 * np.pi * 2600 * t) * np.exp(-t / 0.025)
    return y


def _whoosh(n, rng):
    u = np.linspace(0.0, 1.0, n)
    x = rng.standard_normal(n)
    cutoff = 500.0 + 4000.0 * np.sin(np.pi * u) ** 1.5  # swell: open up, then close
    y = _lowpass_sweep(x, cutoff)
    return y * (np.sin(np.pi * u) ** 2)  # smooth in/out


def _impact(n, rng):
    t = np.arange(n) / SR
    body = np.sin(2 * np.pi * 55 * t) * np.exp(-t / 0.18)
    thump = _lowpass_sweep(rng.standard_normal(n), np.full(n, 300.0)) * np.exp(-t / 0.10)
    return 0.9 * body + 0.5 * thump


def _bed(n, rng):
    u = np.linspace(0.0, 1.0, n)
    y = _lowpass_sweep(rng.standard_normal(n), np.full(n, 800.0)) * 0.3
    f = min(int(0.25 * SR), n // 4)  # gentle fades so it sits under narration
    y[:f] *= np.linspace(0, 1, f)
    y[-f:] *= np.linspace(1, 0, f)
    return y


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--seconds", type=float, required=True)
    args = ap.parse_args()

    text = sys.stdin.read().strip()
    if not text:
        raise SystemExit("synth_sfx: no prompt text on stdin")
    if args.seconds <= 0 or args.seconds > 30:
        raise SystemExit(f"synth_sfx: bad --seconds {args.seconds}")

    seed = int(hashlib.sha1(text.encode()).hexdigest()[:8], 16)
    rng = np.random.default_rng(seed)
    n = int(round(args.seconds * SR))
    low = text.lower()

    if any(k in low for k in ("tick", "click", "pen", "snap", "tap", "blip")):
        y = _tick(n, rng)
    elif any(k in low for k in ("whoosh", "flyby", "zoom", "rush", "swish", "wind", "air", "pass", "sweep")):
        y = _whoosh(n, rng)
    elif any(k in low for k in ("impact", "thud", "boom", "thump", "explosion", "hit", "crash", "bang")):
        y = _impact(n, rng)
    else:
        y = _bed(n, rng)

    _write_wav(args.out, y)
    print(f"sfx: wrote {args.out} ({args.seconds:.2f}s, kind={_kind(low)})", file=sys.stderr)


def _kind(low):
    if any(k in low for k in ("tick", "click", "pen", "snap", "tap", "blip")):
        return "tick"
    if any(k in low for k in ("whoosh", "flyby", "zoom", "rush", "swish", "wind", "air", "pass", "sweep")):
        return "whoosh"
    if any(k in low for k in ("impact", "thud", "boom", "thump", "explosion", "hit", "crash", "bang")):
        return "impact"
    return "bed"


if __name__ == "__main__":
    main()
