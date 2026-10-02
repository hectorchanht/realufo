"""AI key moments for video records (spec: docs/superpowers/specs/2026-10-02-realufo-ai-key-moments-design.md).

    python3 -m ingest.moments --dry-run --ids DOW-UAP-PR133   # print, no writes
    python3 -m ingest.moments --limit 10                      # generate + write to D1

ffmpeg finds scene cuts and frames (timestamps never come from the model); a
Workers AI vision model describes each segment from a 2x2 frame grid; the
result is one JSON document in records.ai_moments.
"""
import json, math, re
from . import d1

MIN_SEG = 3.0       # seconds; shorter segments merge into a neighbour
MAX_MOMENTS = 15    # long videos: window grows so ~15 moments at most
MIN_WINDOW = 20.0   # seconds; window floor for short/medium videos
MAX_WORDS = 60

# Whole-word, case-insensitive. A backstop on top of the prompt, not the main defence.
SPECULATION = ["alien", "aliens", "ufo", "ufos", "craft", "drone", "drones", "aircraft", "airplane",
               "plane", "planes", "jet", "jets", "helicopter", "missile", "missiles", "rocket", "balloon",
               "balloons", "bird", "birds", "satellite", "satellites", "spacecraft", "saucer", "orb", "orbs"]
_SPEC_RE = re.compile(r"\b(" + "|".join(SPECULATION) + r")\b", re.I)


def plan_segments(duration, cuts):
    """[0, cuts..., duration] -> segments; merge < MIN_SEG; split > window."""
    if duration <= 0:
        return []
    pts = [0.0] + sorted(c for c in cuts if 0 < c < duration) + [float(duration)]
    segs = [[a, b] for a, b in zip(pts, pts[1:]) if b > a]
    merged = []
    for s in segs:
        if merged and (s[1] - s[0] < MIN_SEG or merged[-1][1] - merged[-1][0] < MIN_SEG):
            merged[-1][1] = s[1]
        else:
            merged.append(s)
    window = max(MIN_WINDOW, duration / MAX_MOMENTS)
    out = []
    for a, b in merged:
        n = max(1, math.ceil((b - a) / window - 1e-9))
        step = (b - a) / n
        out += [(round(a + i * step, 3), round(a + (i + 1) * step, 3) if i < n - 1 else b) for i in range(n)]
    return out


def frame_times(start, end):
    span = end - start
    return [round(start + span * k / 8, 3) for k in (1, 3, 5, 7)]


def speculative(text):
    return bool(_SPEC_RE.search(text or ""))


def problem(text):
    t = (text or "").strip()
    if not t:
        return "empty"
    if len(t.split()) > MAX_WORDS:
        return "too long"
    if speculative(t):
        return "speculative"
    return None


def merge(segments, results):
    out = []
    for (a, b), r in zip(segments, results):
        if r.get("same_as_previous") and out:
            out[-1]["end"] = b
        else:
            out.append({"start": a, "end": b, "text": r["text"].strip()})
    return out


def doc_json(moments, model, now):
    return json.dumps({"model": model, "generated_at": now, "moments": moments}, ensure_ascii=False)


def update_sql(record_id, doc):
    return f"UPDATE records SET ai_moments={d1.sql_q(doc)} WHERE id={d1.sql_q(record_id)};"
