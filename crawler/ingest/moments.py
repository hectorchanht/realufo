"""AI key moments for video records (spec: docs/superpowers/specs/2026-10-02-realufo-ai-key-moments-design.md).

    python3 -m ingest.moments --dry-run --ids DOW-UAP-PR133   # print, no writes
    python3 -m ingest.moments --limit 10                      # generate + write to D1

ffmpeg finds scene cuts and frames (timestamps never come from the model); a
Workers AI vision model describes each segment from a 2x2 frame grid; the
result is one JSON document in records.ai_moments.
"""
import argparse, datetime, http.client, json, math, os, re, subprocess, tempfile, time
from . import cfapi, d1
from .textindex import reindex_sql

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
    # dense cuts (fast pans, compilations) must not multiply model calls: fold the
    # shortest adjacent pair until at most MAX_MOMENTS remain
    while len(out) > MAX_MOMENTS:
        k = min(range(len(out) - 1), key=lambda i: out[i + 1][1] - out[i][0])
        out[k:k + 2] = [(out[k][0], out[k + 1][1])]
    return out


def frame_times(start, end):
    span = end - start
    return [round(start + span * k / 8, 3) for k in (1, 3, 5, 7)]


def speculative(text):
    return bool(_SPEC_RE.search(text or ""))


TRIM_WORDS = 40


def tidy(text):
    """Model ignores "one sentence" sometimes: keep leading sentences up to TRIM_WORDS words
    (always at least the first). A single over-long sentence is left for problem() to reject."""
    t = (text or "").strip()
    if len(t.split()) <= TRIM_WORDS:
        return t
    out = []
    for s in re.split(r"(?<=[.!?])\s+", t):
        if out and len(" ".join(out + [s]).split()) > TRIM_WORDS:
            break
        out.append(s)
    return " ".join(out)


def problem(text):
    t = (text or "").strip()
    if not t:
        return "empty"
    if len(t.split()) > MAX_WORDS:
        return "too long"
    if speculative(t):
        return "speculative"
    return None


NO_CHANGE_TEXT = "No visible change."
# A sentence that says nothing happened (and names no action) -> one canonical moment.
_NO_CHANGE_RE = re.compile(r"\b(unchanged|no (notable |visible |discernible |significant |apparent )?changes?|"
                           r"remains? (static|consistent|stable|the same)|no (discernible )?movement)\b", re.I)
_ACTION_RE = re.compile(r"\b(appears?|moves?|moving|zoom\w*|pans?|panning|enters?|exits?|leaves?|"
                        r"disappear\w*|transition\w*|changes from|cuts?|while|screen)\b", re.I)


_NEGATED_RE = re.compile(r"\b(no|not|without|nor)\b", re.I)
_CONTRAST_RE = re.compile(r";|\b(but|except|however|although|though|whereas|as)\b", re.I)
_OBJECT_RE = re.compile(r"\b(light sources?|objects?|spots?|dots?|points?|areas? of contrast)\b", re.I)


def no_change(text):
    """True only when the sentence reports nothing: a no-change phrase, no contrast ("but",
    "except", ";" ...), and every clause naming an object or an action is negated
    ("no new objects appear", "... or new light sources appearing")."""
    if not _NO_CHANGE_RE.search(text) or _CONTRAST_RE.search(text):
        return False
    negated = False
    for c in re.split(r"[,.]| and ", text):
        negated = bool(_NEGATED_RE.search(c)) or (negated and c.strip().lower().startswith("or "))
        if (_ACTION_RE.search(c) or _OBJECT_RE.search(c)) and not negated:
            return False
    return True


def _norm(text):
    return " ".join(text.lower().split())


def merge(segments, results):
    """Segments + descriptions -> moments; consecutive identical descriptions fold into one."""
    out = []
    for (a, b), r in zip(segments, results):
        text = NO_CHANGE_TEXT if no_change(r["text"]) else r["text"].strip()
        if out and _norm(out[-1]["text"]) == _norm(text):
            out[-1]["end"] = b
        else:
            out.append({"start": a, "end": b, "text": text})
    return out


def doc_json(moments, model, now):
    return json.dumps({"model": model, "generated_at": now, "moments": moments}, ensure_ascii=False)


def update_sql(record_id, doc):
    return f"UPDATE records SET ai_moments={d1.sql_q(doc)} WHERE id={d1.sql_q(record_id)};" + reindex_sql(record_id)


# Tuned on DOW-UAP-PR133 (see the plan ledger): the model ignores tiny light
# sources and fixates on redaction boxes unless told otherwise, and copies a
# "previous description" verbatim, so none is sent.
SYSTEM = (
    "You write neutral, factual descriptions of government sensor or camera footage, in the style of U.S. "
    "Department of Defense UAP video descriptions. The image is 4 frames of one video in time order "
    "(top-left, top-right, bottom-left, bottom-right). Any black rectangles are redactions, and any "
    "crosshair, brackets or letters are fixed sensor overlays: never mention them unless they appear, "
    "disappear or change. Report what changes between the frames: any small bright or dark spot or object "
    "(where it is relative to the crosshair if there is one, otherwise to the frame centre; which way it "
    "moves; whether it leaves the frame), and camera or sensor "
    "behaviour (panning, zooming in or out, focus, cuts, black screens). Call things 'a light source', "
    "'an area of contrast' or 'an object'. Never identify, classify or guess what anything is, or its size, "
    "speed, distance or origin. One sentence, at most 30 words."
)
REMINDER = " Do not name or guess what any object is; describe only its appearance and movement."
SCHEMA = {"type": "object", "additionalProperties": False, "required": ["text"],
          "properties": {"text": {"type": "string"}}}

SELECT = """SELECT r.id, a.cdn_url, a.duration FROM records r
JOIN assets a ON a.record_id=r.id AND a.role='full' AND a.mime LIKE 'video/%'
WHERE r.status='live' {extra} ORDER BY random()"""  # stuck videos can't block the daily --limit


class Skip(Exception):
    """This video is left for the next run (ai_moments stays NULL)."""


def _probe_duration(url):
    try:
        return subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                               "-of", "csv=p=0", url], capture_output=True, text=True, timeout=60).stdout.strip()
    except subprocess.TimeoutExpired:
        return ""


def parse_scene_cuts(log):
    return [float(m) for m in re.findall(r"pts_time:\s*([0-9.]+)", log or "")]


def scene_cuts(url, duration):
    # keyframes only: fast, coarse cuts are enough because long spans get split anyway
    try:
        p = subprocess.run(["ffmpeg", "-v", "info", "-skip_frame", "nokey", "-i", url, "-an",
                            "-vf", "scale=320:-2,select='gt(scene,0.3)',showinfo", "-f", "null", "-"],
                           capture_output=True, text=True, timeout=600)
    except subprocess.TimeoutExpired:
        raise Skip("scene detection timed out")
    return parse_scene_cuts(p.stderr)


def grid_jpeg(url, times, out):
    """4 frames (800 px wide, contrast-normalized) at `times`, tiled 2x2 in time order -> JPEG at `out`."""
    args = ["ffmpeg", "-v", "error", "-y"]
    for t in times:
        args += ["-ss", f"{t:.3f}", "-i", url]
    # 800 px + normalize: at 480 px the 2-3 px light sources in IR footage vanish for the model
    fc = ";".join(f"[{i}:v]scale=800:-2,normalize=smoothing=0,setsar=1[f{i}]" for i in range(4)) + \
         ";[f0][f1]hstack[top];[f2][f3]hstack[bot];[top][bot]vstack"
    p = subprocess.run(args + ["-filter_complex", fc, "-frames:v", "1", "-q:v", "4", out],
                       capture_output=True, text=True, timeout=120)
    if p.returncode != 0 or not os.path.exists(out) or not os.path.getsize(out):
        raise RuntimeError(p.stderr.strip()[-300:] or "no frame")


def parse_model_output(resp):
    if isinstance(resp, str):
        s = resp.strip()
        s = re.sub(r"^```(?:json)?\s*|\s*```$", "", s, flags=re.I)
        try:
            resp = json.loads(s)
        except ValueError:
            return None
    if not isinstance(resp, dict) or not isinstance(resp.get("text"), str):
        return None
    return {"text": resp["text"].strip()}


def describe(jpeg, start, end, reminder=False):
    """One model call with transport retries (x2, backoff). Returns parsed output or None."""
    text = f"Four frames from seconds {start:.1f}-{end:.1f} of the video."
    for attempt in range(3):
        try:
            return parse_model_output(cfapi.vision_json(SYSTEM + (REMINDER if reminder else ""), text, jpeg, SCHEMA))
        # URLError/TimeoutError/ConnectionReset are OSError; IncompleteRead etc. are HTTPException;
        # a non-JSON body is ValueError; Cloudflare success=false is RuntimeError
        except (OSError, http.client.HTTPException, ValueError, RuntimeError) as e:
            code = getattr(e, "code", None)
            if attempt == 2 or (code is not None and code < 500 and code != 429):
                raise Skip(f"model call failed: {e}")
            time.sleep(2 * (attempt + 1))


def video_duration(row, probe_fn=_probe_duration):
    """assets.duration, else ffprobe; Skip (retry next run) when neither gives a positive number."""
    dur = row.get("duration")
    if not dur:
        try:
            dur = float(probe_fn(row["cdn_url"]))
        except ValueError:
            dur = 0.0
        if not (math.isfinite(dur) and dur > 0):  # CDN blip or unreadable: retry next run
            raise Skip("could not read duration")
    return float(dur)


def moments_for(row, describe_fn=describe, cuts_fn=scene_cuts, grid_fn=grid_jpeg, probe_fn=_probe_duration):
    url = row["cdn_url"]
    dur = video_duration(row, probe_fn)
    segs = plan_segments(dur, cuts_fn(url, dur))
    if not segs:
        return [], 0
    results, calls = [], 0
    with tempfile.TemporaryDirectory() as work:
        for i, (a, b) in enumerate(segs):
            out = os.path.join(work, f"g{i}.jpg")
            for attempt in (1, 2):  # CDN range reads occasionally fail once
                try:
                    grid_fn(url, frame_times(a, b), out)
                    break
                except Exception as e:
                    if attempt == 2:
                        raise Skip(f"frames {a:.1f}-{b:.1f}s: {e}")
            jpeg = open(out, "rb").read()
            got = None
            for retry in (False, True):
                calls += 1
                r = describe_fn(jpeg, a, b, reminder=retry)
                if r:
                    r = {"text": tidy(r["text"])}
                if r and not problem(r["text"]):
                    got = r
                    break
            if not got:
                raise Skip(f"no valid description for {a:.1f}-{b:.1f}s")
            results.append(got)
    return merge(segs, results), calls


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="print moments; no D1 writes")
    ap.add_argument("--limit", type=int, default=None, help="max videos this run")
    ap.add_argument("--ids", default="", help="comma-separated record ids")
    ap.add_argument("--force", action="store_true", help="regenerate even if ai_moments is set")
    ap.add_argument("--plan-only", action="store_true",
                    help="print segment plans only: ffmpeg runs, no frames, no model calls, no writes")
    args = ap.parse_args(argv)
    extra = "" if args.force else "AND r.ai_moments IS NULL"
    if args.ids:
        extra += " AND r.id IN (" + ",".join(d1.sql_q(i.strip()) for i in args.ids.split(",") if i.strip()) + ")"
    rows = d1._d1_json(" ".join(SELECT.format(extra=extra).split()))
    rows = rows[: args.limit] if args.limit else rows
    done = skipped = empty = calls = 0
    for i, row in enumerate(rows, 1):
        if args.plan_only:  # free smoke test (used by manual workflow dry runs)
            try:
                dur = video_duration(row)
                segs = plan_segments(dur, scene_cuts(row["cdn_url"], dur))
            except Skip as e:
                skipped += 1
                print(f"[{i}/{len(rows)}] SKIP {row['id']}: {e}")
                continue
            print(f"[{i}/{len(rows)}] {row['id']}: {len(segs)} segments {segs}")
            continue
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
            try:
                d1.execute(update_sql(row["id"], doc))
            except subprocess.CalledProcessError as e:
                skipped += 1
                print(f"[{i}/{len(rows)}] SKIP {row['id']}: D1 write failed ({e})")
                continue
            print(f"[{i}/{len(rows)}] ok   {row['id']}: {len(moments)} moments")
        empty += not moments
        done += bool(moments)
    mode = "plan-only " if args.plan_only else "dry-run " if args.dry_run else ""
    print(f"{mode}moments: done={done} skipped={skipped} empty={empty} calls={calls}")


if __name__ == "__main__":
    main()
