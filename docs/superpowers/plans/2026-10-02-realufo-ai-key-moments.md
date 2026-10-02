# AI Key Moments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every video doc page can show AI-generated key moments (Workers AI vision over sampled frames), with an Official | AI toggle where official moments exist.

**Architecture:** A Python ingest job (`crawler/ingest/moments.py`) segments each video deterministically with ffmpeg (scene cuts + bounded windows), sends one 2×2 frame grid per segment to `@cf/meta/llama-4-scout-17b-16e-instruct`, validates/merges the sentences, and writes one JSON document to a new `records.ai_moments` column. The web Doc page parses that column and the existing `KeyMoments` box gains a source toggle and AI labelling. No worker change (`GET /api/records/:id` does `SELECT *`).

**Tech Stack:** Python 3.11 stdlib + ffmpeg/ffprobe (crawler), Cloudflare Workers AI REST, D1 via `wrangler d1 execute`, React + TypeScript + Vitest (web).

**Spec:** `docs/superpowers/specs/2026-10-02-realufo-ai-key-moments-design.md`

## Global Constraints

- Model id: `@cf/meta/llama-4-scout-17b-16e-instruct` (exact string, in `cfapi.VISION_MODEL`).
- Storage: `records.ai_moments TEXT` holding `{"model": str, "generated_at": ISO-8601 UTC "…Z", "moments": [{"start": float, "end": float, "text": str}]}`; `NULL` = not generated; `"moments": []` = attempted, nothing usable.
- Segments: merge < 3 s; split longer than `W = max(20, duration / 15)`; timestamps come from ffmpeg only, never from the model.
- Frames: 4 per segment at ⅛, ⅜, ⅝, ⅞ of its span, 480 px wide, tiled 2×2 (left-to-right, top-to-bottom = time order). No `drawtext`. No new Python dependency (stdlib + ffmpeg only).
- Prompt never includes the record title or summary.
- Model output: `{"text": string, "same_as_previous": boolean}`; reject empty text, > 60 words, or speculation words; one sentence ≤ 30 words requested.
- A video gets a complete moment list or nothing (no partial writes).
- Model call retries: ×2 with backoff on timeout/429/5xx; validation retry ×1 per segment.
- End-of-run line: `moments: done=N skipped=N empty=N calls=N`.
- Daily workflow step: `python -m ingest.moments --limit 10` (live) / `--dry-run --limit 1` (otherwise), after the thumbs step.
- Web: toggle choice key `ru:moments-src` in `localStorage` (try/catch), default Official; AI subtitle exactly `AI-generated from video frames · may be inaccurate` in amber; per-row `AI` tag.
- Shared checkout: other chats commit to the same branch. Stage only this plan's files; re-check `git status` before every commit; deploy only from a clean worktree of HEAD.
- Run Python with `cd crawler && python3 -m pytest ingest/tests/<file> -q`; web with Node 22: `export PATH="/Users/laichan/.nvm/versions/node/v22.22.0/bin:$PATH"` then `cd web && npx vitest run <file>`.
- Local Cloudflare credentials for the job: `set -a; . ../.env; set +a` from `crawler/` (token has D1 + Workers AI).

## Review Focus

- A continuous pan with **no scene cuts** must still yield evenly split moments, not one 17-minute moment — pinned in Task 2 (`plan_segments(300, [])`).
- A **very short clip** (< 3 s, or a cut list that merges away) must yield exactly one moment covering the whole clip — pinned in Task 2.
- The model may return the JSON as an **object or a string** (possibly fenced in ```json) — both must parse; anything else is a validation failure, not a crash — pinned in Task 3 (`parse_model_output`).
- Moment text with **apostrophes, quotes and non-ASCII** must survive JSON + SQL escaping into D1 — pinned in Task 2 (`update_sql`).
- **Malformed `ai_moments`** (bad JSON, non-numeric times, end < start, missing text) must hide those entries and never break the page; **`localStorage` throwing** must not break the toggle — pinned in Task 5.

---

### Task 1: Probe the vision model's image input (throwaway)

**Files:**
- Create (scratch, not committed): `$SCRATCH/probe_vision.py` where `SCRATCH=/private/tmp/claude-501/-Users-laichan-code-tung-realufo-superpower/f2e5219b-5934-427a-93bb-8dbd3ae95d03/scratchpad`

**Interfaces:**
- Produces: the confirmed request body shape for Task 3's `cfapi.vision_json` (which variant of the body works) and the response shape (`result.response` as dict or str).

- [ ] **Step 1: Grab one real frame**

```bash
SCRATCH=/private/tmp/claude-501/-Users-laichan-code-tung-realufo-superpower/f2e5219b-5934-427a-93bb-8dbd3ae95d03/scratchpad
ffmpeg -v error -y -ss 30 -i https://assets.realufo.org/videos/wargov/DOD_111985772.mp4 -frames:v 1 -vf scale=480:-2 $SCRATCH/probe.jpg && ls -l $SCRATCH/probe.jpg
```

Expected: a JPEG of a few tens of KB.

- [ ] **Step 2: Write the probe**

```python
# probe_vision.py — try the two plausible body shapes, print which works
import base64, json, os, sys, urllib.request
acct, tok = os.environ["CLOUDFLARE_ACCOUNT_ID"], os.environ["CLOUDFLARE_API_TOKEN"]
url = f"https://api.cloudflare.com/client/v4/accounts/{acct}/ai/run/@cf/meta/llama-4-scout-17b-16e-instruct"
b64 = base64.b64encode(open(sys.argv[1], "rb").read()).decode()
schema = {"type": "object", "properties": {"text": {"type": "string"}, "same_as_previous": {"type": "boolean"}},
          "required": ["text", "same_as_previous"]}
sys_msg = {"role": "system", "content": "Describe only what is visible. One sentence. Reply as JSON."}
bodies = {
    "image_url block": {"messages": [sys_msg, {"role": "user", "content": [
        {"type": "text", "text": "Frame from a sensor video."},
        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}}]}],
        "guided_json": schema, "max_tokens": 200},
    "top-level image": {"messages": [sys_msg, {"role": "user", "content": "Frame from a sensor video."}],
        "image": f"data:image/jpeg;base64,{b64}", "guided_json": schema, "max_tokens": 200},
}
for name, body in bodies.items():
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST",
                                 headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            out = json.loads(r.read())
        print(name, "->", json.dumps(out.get("result"), ensure_ascii=False)[:400])
    except urllib.error.HTTPError as e:
        print(name, "-> HTTP", e.code, e.read()[:300])
```

- [ ] **Step 3: Run it**

```bash
cd crawler && set -a; . ../.env; set +a; python3 $SCRATCH/probe_vision.py $SCRATCH/probe.jpg
```

Expected: at least one variant returns `result.response` describing the frame. Note which variant works and whether `response` is a dict or a JSON string. If only `"top-level image"` works, Task 3's `vision_json` uses that body instead of the content-array one (the rest of the plan is unaffected). If neither works, stop and report.

---

### Task 2: Pure planning, validation and SQL helpers

**Files:**
- Create: `crawler/ingest/moments.py`
- Test: `crawler/ingest/tests/test_moments.py`

**Interfaces:**
- Consumes: `ingest.d1.sql_q(v) -> str`.
- Produces (all in `ingest.moments`):
  - `plan_segments(duration: float, cuts: list[float]) -> list[tuple[float, float]]`
  - `frame_times(start: float, end: float) -> list[float]` (4 values)
  - `speculative(text: str) -> bool`
  - `problem(text: str) -> str | None` (reason string, or None when OK)
  - `merge(segments: list[tuple[float, float]], results: list[dict]) -> list[dict]` → `[{"start","end","text"}]`
  - `doc_json(moments: list[dict], model: str, now: str) -> str`
  - `update_sql(record_id: str, doc: str) -> str`

- [ ] **Step 1: Write the failing tests**

```python
# crawler/ingest/tests/test_moments.py
import json
from ingest.moments import plan_segments, frame_times, speculative, problem, merge, doc_json, update_sql


def test_plan_segments_uses_cuts_merges_short_and_splits_long():
    # 1.0 leaves a 1 s head (merges forward); 38.5 leaves a 1.5 s tail (merges back);
    # the remaining 15-40 span is 25 s > 20 s window, so it splits in two.
    assert plan_segments(40.0, [1.0, 15.0, 38.5]) == [(0.0, 15.0), (15.0, 27.5), (27.5, 40.0)]
    assert plan_segments(35.0, [15.0]) == [(0.0, 15.0), (15.0, 35.0)]


def test_plan_segments_without_cuts_splits_evenly():
    segs = plan_segments(300.0, [])
    assert len(segs) == 15 and segs[0] == (0.0, 20.0) and segs[-1] == (280.0, 300.0)
    assert all(abs((e - s) - 20.0) < 1e-6 for s, e in segs)


def test_plan_segments_caps_long_videos_at_about_15():
    segs = plan_segments(1056.0, [])
    assert 14 <= len(segs) <= 15
    assert segs[0][0] == 0.0 and segs[-1][1] == 1056.0


def test_plan_segments_tiny_clip_is_one_moment():
    assert plan_segments(2.5, [1.2]) == [(0.0, 2.5)]
    assert plan_segments(0.0, []) == []


def test_frame_times_are_eighths():
    assert frame_times(0.0, 8.0) == [1.0, 3.0, 5.0, 7.0]


def test_speculation_filter_whole_words_case_insensitive():
    assert speculative("A UFO crosses the frame.")
    assert speculative("The object resembles an Aircraft.")
    assert not speculative("The sensor pans to keep an area of contrast in orbit view.")  # 'orbit' is not 'orb'
    assert not speculative("A light source moves left.")


def test_problem_flags_empty_long_and_speculative():
    assert problem("") == "empty"
    assert problem("word " * 61) == "too long"
    assert problem("A drone hovers.") == "speculative"
    assert problem("The sensor zooms in.") is None


def test_merge_folds_same_as_previous_runs():
    segs = [(0.0, 5.0), (5.0, 9.0), (9.0, 20.0)]
    res = [{"text": "Pan right.", "same_as_previous": False},
           {"text": "Still panning.", "same_as_previous": True},
           {"text": "Zoom in.", "same_as_previous": False}]
    assert merge(segs, res) == [{"start": 0.0, "end": 9.0, "text": "Pan right."},
                                {"start": 9.0, "end": 20.0, "text": "Zoom in."}]
    # a leading same_as_previous has nothing to fold into: kept
    assert merge([(0.0, 3.0)], [{"text": "X.", "same_as_previous": True}]) == [{"start": 0.0, "end": 3.0, "text": "X."}]


def test_doc_json_and_update_sql_escape_quotes_and_unicode():
    doc = doc_json([{"start": 0.0, "end": 4.5, "text": "It's a “focus box” — café"}], "m", "2026-10-02T00:00:00Z")
    parsed = json.loads(doc)
    assert parsed == {"model": "m", "generated_at": "2026-10-02T00:00:00Z",
                      "moments": [{"start": 0.0, "end": 4.5, "text": "It's a “focus box” — café"}]}
    sql = update_sql("O'X", doc)
    assert sql.startswith("UPDATE records SET ai_moments='") and "It''s" in sql and "id='O''X'" in sql
    assert "café" in sql
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd crawler && python3 -m pytest ingest/tests/test_moments.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'ingest.moments'`

- [ ] **Step 3: Write minimal implementation**

```python
# crawler/ingest/moments.py
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd crawler && python3 -m pytest ingest/tests/test_moments.py -q`
Expected: all pass. If `test_plan_segments_caps_long_videos_at_about_15` fails, check the window math (1056/15 = 70.4 s → 15 segments).

- [ ] **Step 5: Commit**

```bash
git add crawler/ingest/moments.py crawler/ingest/tests/test_moments.py
git commit -m "feat(moments): segment planning, validation, merge and SQL helpers"
```

---

### Task 3: ffmpeg, model call and the job runner

**Files:**
- Modify: `crawler/ingest/cfapi.py` (add `VISION_MODEL`, `vision_json`)
- Modify: `crawler/ingest/moments.py` (add `parse_scene_cuts`, `scene_cuts`, `grid_jpeg`, `parse_model_output`, `describe`, `Skip`, `moments_for`, `main`)
- Test: `crawler/ingest/tests/test_moments.py` (append)

**Interfaces:**
- Consumes: Task 2 functions; `ingest.d1._d1_json(sql) -> list[dict]`, `ingest.d1.execute(sql) -> None`; Task 1's confirmed body shape. (Does **not** import `ingest.thumbs`: that pulls in `ingest.fetch` → `curl_cffi`; the 3-line ffprobe call is repeated as `_probe_duration`.)
- Produces:
  - `cfapi.VISION_MODEL: str`; `cfapi.vision_json(system: str, text: str, jpeg: bytes, schema: dict, max_tokens: int = 200) -> object` (raw `result.response`)
  - `moments.parse_scene_cuts(showinfo_stderr: str) -> list[float]`
  - `moments.parse_model_output(resp: object) -> dict | None` (`{"text": str, "same_as_previous": bool}` or None)
  - `moments.Skip(Exception)`
  - `moments.moments_for(row: dict, describe_fn, cuts_fn, grid_fn, probe_fn) -> tuple[list[dict], int]` (moments, calls); raises `Skip(reason)`
  - CLI `python3 -m ingest.moments [--dry-run] [--limit N] [--ids A,B] [--force]`

- [ ] **Step 1: Write the failing tests (append to test_moments.py)**

```python
import pytest
from ingest.moments import parse_scene_cuts, parse_model_output, moments_for, Skip


def test_parse_scene_cuts_reads_showinfo_pts_time():
    log = ("[Parsed_showinfo_2 @ 0x1] n:   0 pts:  12 pts_time:4.004   duration:1\n"
           "noise line\n"
           "[Parsed_showinfo_2 @ 0x1] n:   1 pts:  99 pts_time:17.5    duration:1\n")
    assert parse_scene_cuts(log) == [4.004, 17.5]
    assert parse_scene_cuts("") == []


def test_parse_model_output_accepts_object_string_and_fenced():
    ok = {"text": "The sensor pans.", "same_as_previous": False}
    assert parse_model_output(ok) == ok
    assert parse_model_output(json.dumps(ok)) == ok
    assert parse_model_output("```json\n" + json.dumps(ok) + "\n```") == ok
    assert parse_model_output({"text": "x"}) == {"text": "x", "same_as_previous": False}
    assert parse_model_output("not json") is None
    assert parse_model_output({"same_as_previous": True}) is None
    assert parse_model_output(None) is None


def _fakes(texts):
    calls = []
    def describe(jpeg, start, end, prev, reminder=False):
        calls.append((start, end, prev, reminder))
        t = texts[len(calls) - 1]
        return {"text": t, "same_as_previous": False}
    return describe, calls


def test_moments_for_happy_path_counts_calls():
    describe, calls = _fakes(["Pan right.", "Zoom in."])
    row = {"id": "V1", "cdn_url": "u", "duration": 35.0}
    moments, n = moments_for(row, describe, cuts_fn=lambda url, d: [15.0],
                             grid_fn=lambda url, times, out: open(out, "wb").write(b"jpg"),
                             probe_fn=lambda url: "")
    assert moments == [{"start": 0.0, "end": 15.0, "text": "Pan right."},
                       {"start": 15.0, "end": 35.0, "text": "Zoom in."}]
    assert n == 2 and calls[1][2] == "Pan right."   # previous sentence passed for continuity


def test_moments_for_retries_speculation_once_then_skips():
    describe, calls = _fakes(["A drone appears.", "A drone appears."])
    row = {"id": "V1", "cdn_url": "u", "duration": 10.0}
    with pytest.raises(Skip):
        moments_for(row, describe, cuts_fn=lambda u, d: [], grid_fn=lambda u, t, o: open(o, "wb").write(b"j"),
                    probe_fn=lambda u: "")
    assert len(calls) == 2 and calls[1][3] is True   # second try carries the reminder


def test_moments_for_empty_when_no_duration_and_skip_when_grid_fails():
    describe, _ = _fakes([])
    assert moments_for({"id": "V", "cdn_url": "u", "duration": None}, describe,
                       cuts_fn=lambda u, d: [], grid_fn=None, probe_fn=lambda u: "N/A") == ([], 0)
    def bad_grid(u, t, o):
        raise RuntimeError("ffmpeg died")
    with pytest.raises(Skip):
        moments_for({"id": "V", "cdn_url": "u", "duration": 9.0}, describe,
                    cuts_fn=lambda u, d: [], grid_fn=bad_grid, probe_fn=lambda u: "")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd crawler && python3 -m pytest ingest/tests/test_moments.py -q`
Expected: FAIL — `ImportError: cannot import name 'parse_scene_cuts'`

- [ ] **Step 3: Add the model call to cfapi.py**

Append to `crawler/ingest/cfapi.py` (use the body variant Task 1 confirmed; shown here is the `image_url` content-block variant):

```python
VISION_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct"

def vision_json(system: str, text: str, jpeg: bytes, schema: dict, max_tokens: int = 200):
    """One image + text -> the model's raw `response` (dict or JSON string)."""
    import base64
    url = "data:image/jpeg;base64," + base64.b64encode(jpeg).decode()
    body = {"messages": [{"role": "system", "content": system},
                         {"role": "user", "content": [{"type": "text", "text": text},
                                                      {"type": "image_url", "image_url": {"url": url}}]}],
            "guided_json": schema, "max_tokens": max_tokens}
    return _call(f"/ai/run/{VISION_MODEL}", json.dumps(body).encode()).get("response")
```

- [ ] **Step 4: Add the runner to moments.py**

Append to `crawler/ingest/moments.py` and extend the imports at the top to
`import argparse, datetime, json, math, os, re, subprocess, tempfile, time, urllib.error` and
`from . import cfapi, d1`:

```python
SYSTEM = (
    "You write neutral, factual video descriptions in the style of U.S. Department of Defense UAP video "
    "descriptions. Describe only what is visible in the frames: camera or sensor behaviour (pans, zooms, "
    "focus changes, on-screen overlays, reticles, cuts, black screens) and objects as 'a light source', "
    "'an area of contrast' or 'an object'. Never identify, classify or speculate about what an object is, "
    "or its size, speed, distance or origin. If nothing changes, say so plainly. Reply with one sentence of "
    "at most 30 words. Set same_as_previous to true only if these frames show the same thing as the "
    "previous description."
)
REMINDER = " Do not name or guess what any object is; describe only its appearance and movement."
SCHEMA = {"type": "object", "additionalProperties": False, "required": ["text", "same_as_previous"],
          "properties": {"text": {"type": "string"}, "same_as_previous": {"type": "boolean"}}}

SELECT = """SELECT r.id, a.cdn_url, a.duration FROM records r
JOIN assets a ON a.record_id=r.id AND a.role='full' AND a.mime LIKE 'video/%'
WHERE r.status='live' {extra} ORDER BY r.id"""


class Skip(Exception):
    """This video is left for the next run (ai_moments stays NULL)."""


def _probe_duration(url):
    return subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                           "-of", "csv=p=0", url], capture_output=True, text=True).stdout.strip()


def parse_scene_cuts(log):
    return [float(m) for m in re.findall(r"pts_time:\s*([0-9.]+)", log or "")]


def scene_cuts(url, duration):
    # keyframes only: fast, coarse cuts are enough because long spans get split anyway
    p = subprocess.run(["ffmpeg", "-v", "info", "-skip_frame", "nokey", "-i", url, "-an",
                        "-vf", "scale=320:-2,select='gt(scene,0.3)',showinfo", "-f", "null", "-"],
                       capture_output=True, text=True)
    return parse_scene_cuts(p.stderr)


def grid_jpeg(url, times, out):
    """4 frames (480 px wide) at `times`, tiled 2x2 in time order -> JPEG at `out`."""
    args = ["ffmpeg", "-v", "error", "-y"]
    for t in times:
        args += ["-ss", f"{t:.3f}", "-i", url]
    fc = ";".join(f"[{i}:v]scale=480:-2,setsar=1[f{i}]" for i in range(4)) + \
         ";[f0][f1]hstack[top];[f2][f3]hstack[bot];[top][bot]vstack"
    p = subprocess.run(args + ["-filter_complex", fc, "-frames:v", "1", "-q:v", "4", out],
                       capture_output=True, text=True)
    if p.returncode != 0 or not os.path.exists(out) or not os.path.getsize(out):
        raise RuntimeError(p.stderr.strip()[-300:] or "no frame")


def parse_model_output(resp):
    if isinstance(resp, str):
        s = resp.strip()
        s = re.sub(r"^```(?:json)?\s*|\s*```$", "", s)
        try:
            resp = json.loads(s)
        except ValueError:
            return None
    if not isinstance(resp, dict) or not isinstance(resp.get("text"), str):
        return None
    return {"text": resp["text"].strip(), "same_as_previous": bool(resp.get("same_as_previous", False))}


def describe(jpeg, start, end, prev, reminder=False):
    """One model call with transport retries (x2, backoff). Returns parsed output or None."""
    text = (f"Four frames from seconds {start:.1f}-{end:.1f} of a government sensor or camera video, "
            "in time order left-to-right, top-to-bottom.")
    if prev:
        text += f" Previous description: {prev}"
    for attempt in range(3):
        try:
            return parse_model_output(cfapi.vision_json(SYSTEM + (REMINDER if reminder else ""), text, jpeg, SCHEMA))
        except (urllib.error.URLError, TimeoutError, RuntimeError) as e:
            code = getattr(e, "code", None)
            if attempt == 2 or (code is not None and code < 500 and code != 429):
                raise Skip(f"model call failed: {e}")
            time.sleep(2 * (attempt + 1))


def moments_for(row, describe_fn=describe, cuts_fn=scene_cuts, grid_fn=grid_jpeg, probe_fn=_probe_duration):
    url = row["cdn_url"]
    dur = row.get("duration")
    if not dur:
        try:
            dur = float(probe_fn(url))
        except ValueError:
            dur = 0.0
    segs = plan_segments(float(dur), cuts_fn(url, dur) if dur else [])
    if not segs:
        return [], 0
    results, calls, prev = [], 0, ""
    with tempfile.TemporaryDirectory() as work:
        for i, (a, b) in enumerate(segs):
            out = os.path.join(work, f"g{i}.jpg")
            try:
                grid_fn(url, frame_times(a, b), out)
            except Exception as e:
                raise Skip(f"frames {a:.1f}-{b:.1f}s: {e}")
            jpeg = open(out, "rb").read()
            got = None
            for retry in (False, True):
                calls += 1
                r = describe_fn(jpeg, a, b, prev, reminder=retry)
                if r and not problem(r["text"]):
                    got = r
                    break
            if not got:
                raise Skip(f"no valid description for {a:.1f}-{b:.1f}s")
            results.append(got)
            prev = got["text"]
    return merge(segs, results), calls


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="print moments; no D1 writes")
    ap.add_argument("--limit", type=int, default=None, help="max videos this run")
    ap.add_argument("--ids", default="", help="comma-separated record ids")
    ap.add_argument("--force", action="store_true", help="regenerate even if ai_moments is set")
    args = ap.parse_args(argv)
    extra = "" if args.force else "AND r.ai_moments IS NULL"
    if args.ids:
        extra += " AND r.id IN (" + ",".join(d1.sql_q(i.strip()) for i in args.ids.split(",") if i.strip()) + ")"
    rows = d1._d1_json(" ".join(SELECT.format(extra=extra).split()))
    rows = rows[: args.limit] if args.limit else rows
    done = skipped = empty = calls = 0
    for i, row in enumerate(rows, 1):
        try:
            moments, n = moments_for(row)
        except Skip as e:
            skipped += 1
            print(f"[{i}/{len(rows)}] SKIP {row['id']}: {e}")
            continue
        calls += n
        now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        doc = doc_json(moments, cfapi.VISION_MODEL, now)
        if args.dry_run:
            print(f"[{i}/{len(rows)}] {row['id']}: {doc}")
        else:
            d1.execute(update_sql(row["id"], doc))
            print(f"[{i}/{len(rows)}] ok   {row['id']}: {len(moments)} moments")
        empty += not moments
        done += bool(moments)
    print(f"{'dry-run ' if args.dry_run else ''}moments: done={done} skipped={skipped} empty={empty} calls={calls}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd crawler && python3 -m pytest ingest/tests/ -q`
Expected: all ingest tests pass (new + existing).

- [ ] **Step 6: Real dry run on one video**

```bash
cd crawler && set -a; . ../.env; set +a; python3 -m ingest.moments --dry-run --ids DOW-UAP-PR133
```

Expected: one line with a JSON document of ≤ 15 neutral moments, then `dry-run moments: done=1 skipped=0 empty=0 calls=N`. If the model call fails with a 4xx, revisit Task 1's body shape.

- [ ] **Step 7: Commit**

```bash
git add crawler/ingest/cfapi.py crawler/ingest/moments.py crawler/ingest/tests/test_moments.py
git commit -m "feat(moments): ffmpeg segmentation, Workers AI vision descriptions, ingest.moments CLI"
```

---

### Task 4: Migration, 3-clip dry run, backfill

**Files:**
- Create: `db/migrations/0009_ai_moments.sql` (check `ls db/migrations` first; if 0009 exists, use the next free number)
- Modify: `db/schema.sql` (add the column to `records`)

**Interfaces:**
- Consumes: Task 3 CLI.
- Produces: remote D1 `records.ai_moments` populated for all live videos.

- [ ] **Step 1: Write the migration**

```sql
-- 0009_ai_moments.sql: AI-generated key moments per video (see ingest/moments.py)
ALTER TABLE records ADD COLUMN ai_moments TEXT;
```

And add `ai_moments TEXT` to the `records` table definition in `db/schema.sql`, after the last existing column (keep its comma style).

- [ ] **Step 2: Apply to remote D1**

```bash
export PATH="/Users/laichan/.nvm/versions/node/v22.22.0/bin:$PATH"
npx wrangler d1 migrations apply realufo-db --remote
```

Expected: `0009_ai_moments.sql` applied. (Web and worker tolerate the column: worker `SELECT *` just returns it.)

- [ ] **Step 3: Dry run on three different kinds of footage**

```bash
cd crawler && set -a; . ../.env; set +a
python3 -m ingest.moments --dry-run --ids DOW-UAP-PR133,FBI-UAP-PR003,DOW-UAP-PR159
```

Expected: three JSON documents (IR sensor, handheld phone, 16mm film). Read every sentence: neutral, no identification words, times monotonic. Save the output to `$SCRATCH/moments-dryrun.txt` for the final report.

- [ ] **Step 4: Commit the migration**

```bash
git add db/migrations/0009_ai_moments.sql db/schema.sql
git commit -m "feat(db): records.ai_moments for AI key moments"
```

- [ ] **Step 5: Backfill all live videos**

```bash
cd crawler && set -a; . ../.env; set +a
python3 -m ingest.moments 2>&1 | tee $SCRATCH/moments-backfill.txt | tail -5
```

Expected: final line `moments: done≈165 skipped=small empty=small calls≈1,000–1,700`. Re-run once to retry skips (`ai_moments IS NULL` rows only). Then verify:

```bash
cd .. && npx wrangler d1 execute realufo-db --remote --json --command "SELECT count(*) n, sum(ai_moments IS NOT NULL) have FROM records r JOIN assets a ON a.record_id=r.id AND a.role='full' AND a.mime LIKE 'video/%' WHERE r.status='live'"
```

---

### Task 5: Web — parse AI moments, Official | AI toggle, AI label

**Files:**
- Modify: `web/src/api/types.ts` (`RecordFull.ai_moments?: string | null`)
- Modify: `web/src/lib/keyMoments.ts` (add `parseAiMoments`)
- Modify: `web/src/components/VideoTools.tsx` (`KeyMoments` props `official`, `ai`)
- Modify: `web/src/screens/Doc.tsx` (feed both lists)
- Test: `web/src/tests/keyMoments.test.ts`, `web/src/tests/doc.test.tsx`

**Interfaces:**
- Consumes: `KeyMoment` from `web/src/lib/keyMoments.ts` (`{ start: number; end: number | null; text: string }`); `formatMoment` from `web/src/lib/recordMedia.ts`.
- Produces: `parseAiMoments(raw: string | null | undefined): KeyMoment[]`; `<KeyMoments official={KeyMoment[]} ai={KeyMoment[]} videoRef onSeek />`.

- [ ] **Step 1: Write the failing tests**

Append to `web/src/tests/keyMoments.test.ts`:

```ts
import { parseAiMoments } from "../lib/keyMoments";

describe("parseAiMoments", () => {
  it("reads the stored JSON document", () => {
    const raw = JSON.stringify({ model: "m", generated_at: "t", moments: [{ start: 0, end: 4.5, text: "Pan right." }, { start: 4.5, end: 9, text: "Zoom in." }] });
    expect(parseAiMoments(raw)).toEqual([
      { start: 0, end: 4.5, text: "Pan right." },
      { start: 4.5, end: 9, text: "Zoom in." },
    ]);
  });

  it("drops invalid entries and never throws on bad input", () => {
    const raw = JSON.stringify({ moments: [{ start: "x", end: 2, text: "a" }, { start: 5, end: 3, text: "b" }, { start: 1, end: 2 }, { start: 2, end: 3, text: "ok" }] });
    expect(parseAiMoments(raw)).toEqual([{ start: 2, end: 3, text: "ok" }]);
    expect(parseAiMoments("{not json")).toEqual([]);
    expect(parseAiMoments(JSON.stringify({ moments: "nope" }))).toEqual([]);
    expect(parseAiMoments(null)).toEqual([]);
    expect(parseAiMoments(undefined)).toEqual([]);
  });
});
```

Append to `web/src/tests/doc.test.tsx`, before `it("no image tools on non-image records"`:

```tsx
  const AI = JSON.stringify({ model: "m", generated_at: "t", moments: [{ start: 0, end: 30, text: "A light source drifts right." }, { start: 30, end: 60, text: "The sensor zooms out." }] });

  it("AI key moments: Official default, toggle to AI shows AI rows + amber label, choice remembered", () => {
    localStorage.removeItem?.("ru:moments-src");
    useRecordMock.mockReturnValue({
      data: {
        ...mockDetail,
        record: { ...mockDetail.record, kind: "video", summary: "Report.\n\nVideo Description:\n00:00-00:04: The sensor pans.", ai_moments: AI },
        assets: [{ role: "full", cdn_url: "https://cdn.example/clip.mp4", mime: "video/mp4", width: null, height: null }],
      },
      isLoading: false,
    });
    const { unmount } = renderDoc();
    const box = screen.getByRole("region", { name: "Key moments" });
    expect(box).toHaveTextContent("The sensor pans.");
    expect(box).toHaveTextContent("from the official video description");
    fireEvent.click(screen.getByRole("button", { name: "AI" }));
    expect(box).toHaveTextContent("A light source drifts right.");
    expect(box).toHaveTextContent("AI-generated from video frames · may be inaccurate");
    expect(screen.getByRole("button", { name: "AI" })).toHaveAttribute("aria-pressed", "true");
    unmount();
    renderDoc();
    expect(screen.getByRole("region", { name: "Key moments" })).toHaveTextContent("A light source drifts right.");
    localStorage.removeItem?.("ru:moments-src");
  });

  it("AI-only video shows the AI list without a toggle", () => {
    useRecordMock.mockReturnValue({
      data: {
        ...mockDetail,
        record: { ...mockDetail.record, kind: "video", summary: "Archival footage.", ai_moments: AI },
        assets: [{ role: "full", cdn_url: "https://cdn.example/clip.mp4", mime: "video/mp4", width: null, height: null }],
      },
      isLoading: false,
    });
    renderDoc();
    const box = screen.getByRole("region", { name: "Key moments" });
    expect(box).toHaveTextContent("The sensor zooms out.");
    expect(box).toHaveTextContent("AI-generated from video frames · may be inaccurate");
    expect(screen.queryByRole("button", { name: "Official" })).toBeNull();
  });

  it("toggle still works when localStorage throws", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    useRecordMock.mockReturnValue({
      data: {
        ...mockDetail,
        record: { ...mockDetail.record, kind: "video", summary: "R.\n\nVideo Description:\n00:00-00:04: The sensor pans.", ai_moments: AI },
        assets: [{ role: "full", cdn_url: "https://cdn.example/clip.mp4", mime: "video/mp4", width: null, height: null }],
      },
      isLoading: false,
    });
    renderDoc();
    fireEvent.click(screen.getByRole("button", { name: "AI" }));
    expect(screen.getByRole("region", { name: "Key moments" })).toHaveTextContent("A light source drifts right.");
    get.mockRestore();
    set.mockRestore();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run src/tests/keyMoments.test.ts src/tests/doc.test.tsx`
Expected: FAIL — `parseAiMoments` not exported; Doc tests can't find the `AI` button.

- [ ] **Step 3: Implement `parseAiMoments`**

Append to `web/src/lib/keyMoments.ts`:

```ts
/** records.ai_moments JSON → moments; invalid entries dropped, never throws. */
export function parseAiMoments(raw: string | null | undefined): KeyMoment[] {
  if (!raw) return [];
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch {
    return [];
  }
  const list = (doc as { moments?: unknown })?.moments;
  if (!Array.isArray(list)) return [];
  return list.flatMap((m) => {
    const { start, end, text } = (m ?? {}) as { start?: unknown; end?: unknown; text?: unknown };
    const ok =
      typeof start === "number" && Number.isFinite(start) && start >= 0 &&
      typeof end === "number" && Number.isFinite(end) && end >= start &&
      typeof text === "string" && text.trim() !== "";
    return ok ? [{ start, end, text: text.trim() }] : [];
  });
}
```

Add to `RecordFull` in `web/src/api/types.ts`: `ai_moments?: string | null; // JSON from ingest.moments`.

- [ ] **Step 4: Toggle + label in `KeyMoments`**

In `web/src/components/VideoTools.tsx`, change the `KeyMoments` signature and header; keep the seek/highlight/follow logic, but drive it from `moments` computed below:

```tsx
const SRC_KEY = "ru:moments-src";

export function KeyMoments({
  official,
  ai,
  videoRef,
  onSeek,
}: {
  official: KeyMoment[];
  ai: KeyMoment[];
  videoRef: RefObject<HTMLVideoElement | null>;
  onSeek: (t: number) => void;
}) {
  const [src, setSrc] = useState<"official" | "ai">(() => {
    try {
      return localStorage.getItem(SRC_KEY) === "ai" ? "ai" : "official";
    } catch {
      return "official";
    }
  });
  const both = official.length > 0 && ai.length > 0;
  const isAi = ai.length > 0 && (src === "ai" || official.length === 0);
  const moments = isAi ? ai : official;
  function choose(next: "official" | "ai") {
    setSrc(next);
    try {
      localStorage.setItem(SRC_KEY, next);
    } catch {
      /* private mode etc.: choice lasts for this page only */
    }
  }
  // Keep the existing `active` / `list` state and both effects exactly as they are;
  // they already read `moments` and list it in their dependency arrays.
```

Header (replace the existing header `div`):

```tsx
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-3.5 pb-1.5 pt-3">
        <div className="flex items-center gap-2">
          <h2 className="font-mono text-[10px] font-bold tracking-[.6px] text-signal">KEY MOMENTS</h2>
          {both && (
            <span className="flex gap-1">
              {(["official", "ai"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={(k === "ai") === isAi}
                  onClick={() => choose(k)}
                  className={`${chip} ${(k === "ai") === isAi ? on : off} px-[7px] py-[2px] text-[9px]`}
                >
                  {k === "ai" ? "AI" : "Official"}
                </button>
              ))}
            </span>
          )}
        </div>
        <span className={`font-mono text-[8.5px] ${isAi ? "text-amber" : "text-faint"}`}>
          {isAi ? "AI-generated from video frames · may be inaccurate" : "from the official video description"}
        </span>
      </div>
```

Row: inside the row button, after the time span, add when `isAi`:

```tsx
              {isAi && (
                <span className="flex-none self-start rounded border border-amber px-1 font-mono text-[8px] leading-[14px] text-amber">AI</span>
              )}
```

and make the active-index effect depend on `moments` (it already lists `moments` in its deps — keep it).

- [ ] **Step 5: Feed both lists from Doc**

In `web/src/screens/Doc.tsx`:

```tsx
import { parseAiMoments, parseKeyMoments } from "../lib/keyMoments";
// next to keyMoments:
const aiMoments = useMemo(() => parseAiMoments(detail?.record.ai_moments), [detail]);
```

and replace the render block:

```tsx
      {media === "video" && (keyMoments.moments.length > 0 || aiMoments.length > 0) && (
        <KeyMoments official={keyMoments.moments} ai={aiMoments} videoRef={videoRef} onSeek={seekTo} />
      )}
```

- [ ] **Step 6: Run tests**

Run: `cd web && npx tsc -b && npx vitest run`
Expected: typecheck clean; all tests pass (existing key-moments tests unchanged in behaviour).

- [ ] **Step 7: Commit**

```bash
git add web/src/api/types.ts web/src/lib/keyMoments.ts web/src/components/VideoTools.tsx web/src/screens/Doc.tsx web/src/tests/keyMoments.test.ts web/src/tests/doc.test.tsx
git commit -m "feat(doc): AI key moments with Official | AI toggle and AI labelling"
```

---

### Task 6: Daily workflow step, browser check, deploy

**Files:**
- Modify: `.github/workflows/ingest.yml` (new `moments` step after the `thumbs` step)

**Interfaces:**
- Consumes: Task 3 CLI; Task 5 web build.

- [ ] **Step 1: Add the workflow step** (insert directly after the `thumbs` step's `run:` block, before the `textindex` step)

```yaml
      # AI key moments for videos still without them (spec 2026-10-02-realufo-ai-key-moments)
      - name: moments
        if: ${{ !cancelled() }}
        working-directory: crawler
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          LIVE: ${{ github.event_name == 'schedule' || github.event.inputs.dry_run == 'false' }}
        run: |
          set -o pipefail
          if [ "$LIVE" = "true" ]; then
            python -m ingest.moments --limit 10 | tee -a ingest-summary.txt
          else
            python -m ingest.moments --dry-run --limit 1 | tee -a ingest-summary.txt
          fi
```

Validate: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ingest.yml'))" 2>/dev/null || ruby -ryaml -e 'YAML.load_file(".github/workflows/ingest.yml")'` → no error.

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ingest.yml
git commit -m "ci(ingest): daily AI key moments step"
```

- [ ] **Step 3: Browser check against production data**

Start the scratch dev server that proxies `/api` to realufo.org (`$SCRATCH/vite.prod-api.config.mjs`, launch entry `web-prod-api` added temporarily to `.claude/launch.json` and removed afterwards). Check: DOW-UAP-PR133 (both lists: toggle, amber label, AI tags, seek) and an AARO clip (AI-only, no toggle). No console errors.

- [ ] **Step 4: Deploy from a clean worktree**

```bash
S=$SCRATCH/deploy; git worktree add --detach $S HEAD
cp .dev.vars $S/ 2>/dev/null || true
cd $S && pnpm install --frozen-lockfile && (cd web && pnpm install --frozen-lockfile)
npx wrangler d1 migrations list realufo-db --remote   # expect: No migrations to apply
(cd web && npx vitest run) && pnpm run deploy
cd - && git worktree remove --force $S
```

Then confirm the live bundle contains `AI-generated from video frames`.
