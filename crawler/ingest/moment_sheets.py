"""Frame sheets for writing a video's key moments by eye (skill: key-moments).

    .venv-ocr/bin/python -m ingest.moment_sheets ID                 # overview + cuts + fleeting objects
    .venv-ocr/bin/python -m ingest.moment_sheets ID --range 8.5 9.6 # every frame in [A,B] (max 60)
    .venv-ocr/bin/python -m ingest.moment_sheets ID --at 8.96,9.0   # single large frames

The record (file URL, crop) comes from the live API; the file is cached in --work.
Black bars are cut (assets.crop, else cropdetect). Needs numpy + Pillow (.venv-ocr has both).
"""
import argparse, json, os, subprocess, tempfile, time, urllib.parse, urllib.request
from io import BytesIO
import numpy as np
from PIL import Image, ImageDraw, ImageFont

API = "https://realufo.org/api/records/"
FONT = ImageFont.load_default(size=18)


def record(rid):
    d = json.load(urllib.request.urlopen(API + urllib.parse.quote(rid), timeout=30))
    full = next(a for a in d["assets"] if a["role"] == "full" and (a["mime"] or "").startswith("video/"))
    return {"id": rid, "title": d["record"]["title"], "url": full["cdn_url"], "crop": (full.get("crop") or "").strip()}


def local(r, work):
    p = os.path.join(work, "vid", r["id"] + ".mp4")
    os.makedirs(os.path.dirname(p), exist_ok=True)
    for _ in range(360):  # another reviewer may be fetching the same file
        if os.path.exists(p) or not os.path.exists(p + ".part"):
            break
        time.sleep(5)
    if not os.path.exists(p):
        tmp = f"{p}.{os.getpid()}.dl"
        urllib.request.urlretrieve(r["url"], tmp)
        os.replace(tmp, p)
    return p


def probe(path):
    j = json.loads(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                                   "stream=width,height,r_frame_rate:format=duration", "-of", "json", path],
                                  capture_output=True, text=True).stdout)
    st = j["streams"][0]
    a, b = st["r_frame_rate"].split("/")
    return int(st["width"]), int(st["height"]), float(a) / float(b), float(j["format"]["duration"])


def detect_bars(path, w0, h0, dur):
    """crop=w:h:x:y when black bars cut >10% of the picture (sampled mid-video), else ''."""
    p = subprocess.run(["ffmpeg", "-v", "info", "-ss", f"{dur * 0.4:.2f}", "-t", "4", "-i", path, "-an",
                        "-vf", "cropdetect=24:2:0", "-f", "null", "-"], capture_output=True, text=True)
    found = [l.split("crop=")[-1].strip() for l in p.stderr.splitlines() if "crop=" in l]
    if not found:
        return ""
    w, h, x, y = map(int, found[-1].split(":"))
    return f"{w}:{h}:{x}:{y}" if w * h < 0.9 * w0 * h0 and w > 64 and h > 64 else ""


def mmss(t):
    return f"{int(t // 60):02d}:{t % 60:05.2f}"


def frame(path, crop, t, width):
    vf = (f"crop={crop}," if crop else "") + f"scale={width}:-2"
    p = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{max(t, 0):.3f}", "-i", path, "-frames:v", "1",
                        "-vf", vf, "-f", "image2pipe", "-c:v", "png", "-"], capture_output=True)
    return Image.open(BytesIO(p.stdout)).convert("RGB") if p.stdout else None


def sheet(tiles, cols, out, boxes=None):
    """tiles [(label, img)] -> labelled grid JPEG; boxes {i: (x0,y0,x1,y1) 0-1} outlined red."""
    tiles = [(l, im) for l, im in tiles if im is not None]
    if not tiles:
        return None
    w, h = tiles[0][1].size
    g = Image.new("RGB", (cols * w, -(-len(tiles) // cols) * h), "black")
    d = ImageDraw.Draw(g)
    for i, (label, im) in enumerate(tiles):
        x, y = (i % cols) * w, (i // cols) * h
        g.paste(im.resize((w, h)), (x, y))
        if boxes and i in boxes:
            x0, y0, x1, y1 = boxes[i]
            d.rectangle([x + x0 * w - 6, y + y0 * h - 6, x + x1 * w + 6, y + y1 * h + 6], outline="red", width=2)
        d.rectangle([x, y, x + 9 * len(label) + 8, y + 22], fill="black")
        d.text((x + 4, y + 2), label, fill="yellow", font=FONT)
    g.save(out, quality=85)
    return out


def transients(f, max_frac=0.12, thresh=35, min_px=3):
    """Grey frames (n,H,W) -> [(i, box 0-1)]: small spots present in frame i but in neither
    neighbour while the neighbours agree there — a fleeting object, not camera shake."""
    n, H, W = f.shape
    out = []
    for i in range(1, n - 1):
        a = np.abs(f[i] - f[i - 1]); b = np.abs(f[i] - f[i + 1]); c = np.abs(f[i - 1] - f[i + 1])
        m = (np.minimum(a, b) - c) > thresh
        if m.sum() < min_px:
            continue
        ys, xs = np.nonzero(m)
        if xs.max() - xs.min() < W * max_frac and ys.max() - ys.min() < H * max_frac:
            out.append((i, (xs.min() / W, ys.min() / H, (xs.max() + 1) / W, (ys.max() + 1) / H)))
    return out


def group(hits, gap=2):
    groups = []
    for i, box in hits:
        if groups and i - groups[-1][-1][0] <= gap:
            groups[-1].append((i, box))
        else:
            groups.append([(i, box)])
    return groups


def analyze(path, crop, cw, ch, fps, dur):
    """Low-res grey decode -> scene cuts, dark spans, fleeting-object events."""
    afps = fps if dur <= 90 else 10 if dur <= 600 else 5
    W = 240
    H = int(round(W * ch / cw / 2)) * 2
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-an", "-vf",
                          (f"crop={crop}," if crop else "") + f"fps={afps},scale={W}:{H},format=gray",
                          "-f", "rawvideo", "-"], capture_output=True).stdout
    f = np.frombuffer(raw, np.uint8)[: len(raw) // (W * H) * W * H].reshape(-1, H, W).astype(np.int16)
    n = len(f)
    t = lambda i: round(i / afps, 3)
    mean = f.reshape(n, -1).mean(1)
    d = np.abs(np.diff(f, axis=0)).reshape(n - 1, -1).mean(1) if n > 1 else np.zeros(0)
    cuts = [t(i + 1) for i in range(len(d)) if d[i] > 30 and d[i] > 3 * np.median(d[max(0, i - 15):i + 15])]
    dark, start = [], None
    for i in range(n):
        if mean[i] < 12 and start is None:
            start = i
        if (mean[i] >= 12 or i == n - 1) and start is not None:
            if i - start >= afps * 0.3:
                dark.append((t(start), t(i)))
            start = None
    events = [{"t0": t(g[0][0]), "t1": t(g[-1][0]), "frames": len(g), "box": g[0][1],
               "path": [f"({(b[0] + b[2]) / 2:.2f},{(b[1] + b[3]) / 2:.2f})" for _, b in g[:6]]}
              for g in group(transients(f))]
    return {"analysis_fps": round(afps, 3), "cuts": cuts[:80], "dark": dark[:40], "events": events}


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("id")
    ap.add_argument("--range", nargs=2, type=float, metavar=("A", "B"))
    ap.add_argument("--at", help="comma-separated seconds")
    ap.add_argument("--every", type=float, help="overview step (s); default dur/60 clamped 0.25..15")
    ap.add_argument("--work", default=os.path.join(tempfile.gettempdir(), "realufo-moments"))
    a = ap.parse_args(argv)
    r = record(a.id)
    path = local(r, a.work)
    w0, h0, fps, dur = probe(path)
    crop = r["crop"] or detect_bars(path, w0, h0, dur)
    cw, ch = map(int, crop.split(":")[:2]) if crop else (w0, h0)
    portrait = ch >= cw
    tw, cols = (200, 10) if portrait else (330, 6)
    outdir = os.path.join(a.work, "out", a.id)
    os.makedirs(outdir, exist_ok=True)
    label = lambda tt: f"{mmss(tt)} F{int(tt * fps + 0.01)}"
    if a.at:
        for s in a.at.split(","):
            tt = float(s)
            print(sheet([(label(tt), frame(path, crop, tt, 540 if portrait else 900))], 1,
                        os.path.join(outdir, f"at_{tt:.2f}.jpg")))
        return
    if a.range:
        t0, t1 = a.range
        n = int((t1 - t0) * fps) + 1
        ts = [t0 + i / fps for i in range(n)] if n <= 60 else [t0 + i * (t1 - t0) / 59 for i in range(60)]
        print(sheet([(label(tt), frame(path, crop, tt, tw)) for tt in ts], cols,
                    os.path.join(outdir, f"range_{t0:.2f}-{t1:.2f}.jpg")))
        return
    info = analyze(path, crop, cw, ch, fps, dur)
    step = a.every or min(15.0, max(0.25, dur / 60))
    ts = [round(i * step, 3) for i in range(int(dur / step) + 1) if i * step < dur - 0.05]
    per = cols * (8 if portrait else 10)
    sheets = [sheet([(mmss(tt), frame(path, crop, tt, tw)) for tt in ts[k:k + per]], cols,
                    os.path.join(outdir, f"overview_{k // per + 1}.jpg")) for k in range(0, len(ts), per)]
    evs = info["events"][:30]
    ev_sheet = sheet([(f"{mmss(e['t0'])} x{e['frames']}", frame(path, crop, e["t0"], tw)) for e in evs], cols,
                     os.path.join(outdir, "events.jpg"), {i: e["box"] for i, e in enumerate(evs)}) if evs else None
    for e in info["events"]:
        e.pop("box")
    print(json.dumps({"id": a.id, "title": r["title"], "duration": round(dur, 2), "fps": round(fps, 3),
                      "crop": crop or None, "overview_every_s": step, "sheets": sheets, "events_sheet": ev_sheet,
                      "n_events": len(info["events"]), **info}, indent=1))


if __name__ == "__main__":
    main()
