"""Shared bits for showcase recipes: 9:16 1080x1920, safe-zone text, 30 fps segments, concat.
Text sits below the app top tabs (~200 px) and above the caption/buttons area (bottom ~450 px)."""
import hashlib, json, os, subprocess, tempfile, urllib.request

FFMPEG = os.environ.get("FFMPEG", "ffmpeg")
FONT = os.environ.get("CLIP_FONT", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")
TMP = tempfile.mkdtemp(prefix="showcase-")
ENC = ["-r", "30", "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "20",
       "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2", "-shortest", "-movflags", "+faststart"]
SILENT = ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"]
_n = 0

def txt(text, y, fs, color="white"):
    """drawtext via textfile= (quotes/colons in text can't break the filtergraph); centred, outline + shadow."""
    global _n
    _n += 1
    fs = min(fs, int(1000 / (0.62 * max(len(text), 1))))  # shrink long lines to fit the 1080 width
    p = os.path.join(TMP, f"t{_n}.txt")
    open(p, "w", encoding="utf-8").write(text)
    return (f"drawtext=fontfile={FONT}:fontcolor={color}:borderw=4:bordercolor=black:shadowcolor=black@0.6:"
            f"shadowx=2:shadowy=2:x=(w-text_w)/2:textfile={p}:expansion=none:fontsize={fs}:y={y}")

SITE = lambda: txt("realufo.org", 1420, 52)

def ramp_lut(r, g, b):
    """lutrgb expression mapping grey 0..255 through 7-stop colour ramps (as the site's SVG palettes)."""
    def ch(stops):
        s = [float(x) for x in stops.split()]
        n = len(s) - 1
        expr = f"{s[-1] * 255:.1f}"
        for i in range(n - 1, -1, -1):
            lo, hi = 255 * i / n, 255 * (i + 1) / n
            seg = f"({s[i] * 255:.1f}+({s[i + 1] * 255:.1f}-{s[i] * 255:.1f})*(val-{lo:.2f})/{hi - lo:.2f})"
            expr = f"if(lt(val\\,{hi:.2f})\\,{seg}\\,{expr})"
        return expr
    return f"format=gray,format=rgb24,lutrgb=r='{ch(r)}':g='{ch(g)}':b='{ch(b)}'"

# web/src/components/ImageTools.tsx "ironbow": black → indigo → magenta → orange → yellow → white
IRONBOW = ramp_lut("0 0.15 0.55 0.85 0.98 1 1", "0 0 0.02 0.2 0.5 0.8 1", "0 0.45 0.6 0.25 0.05 0.2 1")

HERE = os.path.dirname(os.path.abspath(__file__))
VOICE = os.environ.get("ELEVENLABS_VOICE", "nPczCjzI2devNBz1zQrb")  # "Brian": deep, calm narrator

def _dur(path):
    h, m, sec = subprocess.run([FFMPEG, "-i", path], capture_output=True, text=True).stderr.split("Duration: ")[1].split(",")[0].split(":")
    return int(h) * 3600 + int(m) * 60 + float(sec)

def tts(text):
    """ElevenLabs narration → (mp3 path, seconds), cached in showcase/.tts by text + voice.
    Key: ELEVENLABS_API_KEY in the environment or the repo-root .env."""
    settings = {"stability": 0.45, "similarity_boost": 0.8, "style": 0.35, "speed": 1.1}
    out = os.path.join(HERE, ".tts", hashlib.sha1(f"{VOICE}|{settings}|{text}".encode()).hexdigest()[:16] + ".mp3")
    if not os.path.exists(out):
        key = os.environ.get("ELEVENLABS_API_KEY") or next((l.split("=", 1)[1].strip() for l in open(os.path.join(HERE, "..", ".env"))
                                                          if l.startswith("ELEVENLABS_API_KEY=")), None)
        if not key:
            raise SystemExit("ELEVENLABS_API_KEY missing (repo-root .env)")
        req = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE}?output_format=mp3_44100_128",
            data=json.dumps({"text": text, "model_id": "eleven_multilingual_v2",
                             "voice_settings": settings}).encode(),
            headers={"xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/mpeg"})
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with urllib.request.urlopen(req) as r, open(out, "wb") as f:
            f.write(r.read())
    return out, _dur(out)

def sfx(text, seconds, influence=0.6):
    """ElevenLabs sound effect ("pen tick on a checkbox", "jet whoosh") → mp3 path, cached in showcase/.tts."""
    out = os.path.join(HERE, ".tts", "sfx-" + hashlib.sha1(f"{text}|{seconds}|{influence}".encode()).hexdigest()[:16] + ".mp3")
    if not os.path.exists(out):
        key = os.environ.get("ELEVENLABS_API_KEY") or next((l.split("=", 1)[1].strip() for l in open(os.path.join(HERE, "..", ".env"))
                                                          if l.startswith("ELEVENLABS_API_KEY=")), None)
        req = urllib.request.Request("https://api.elevenlabs.io/v1/sound-generation",
            data=json.dumps({"text": text, "duration_seconds": seconds, "prompt_influence": influence}).encode(),
            headers={"xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/mpeg"})
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with urllib.request.urlopen(req) as r, open(out, "wb") as f:
            f.write(r.read())
    return out

def words(mp3):
    """Word timings [(text, start, end)] of a narration mp3 via ElevenLabs speech-to-text (scribe_v1),
    cached next to it as .words.json. Drives word-by-word captions."""
    out = mp3[:-4] + ".words.json"
    if not os.path.exists(out):
        key = os.environ.get("ELEVENLABS_API_KEY") or next((l.split("=", 1)[1].strip() for l in open(os.path.join(HERE, "..", ".env"))
                                                          if l.startswith("ELEVENLABS_API_KEY=")), None)
        b = "realufo" + hashlib.sha1(mp3.encode()).hexdigest()[:12]
        body = (f"--{b}\r\nContent-Disposition: form-data; name=\"model_id\"\r\n\r\nscribe_v1\r\n"
                f"--{b}\r\nContent-Disposition: form-data; name=\"timestamps_granularity\"\r\n\r\nword\r\n"
                f"--{b}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"a.mp3\"\r\nContent-Type: audio/mpeg\r\n\r\n").encode() \
               + open(mp3, "rb").read() + f"\r\n--{b}--\r\n".encode()
        req = urllib.request.Request("https://api.elevenlabs.io/v1/speech-to-text", data=body,
                                     headers={"xi-api-key": key, "Content-Type": f"multipart/form-data; boundary={b}"})
        with urllib.request.urlopen(req) as r:
            ws = [(w["text"], w["start"], w["end"]) for w in json.loads(r.read())["words"] if w.get("type") == "word"]
        json.dump(ws, open(out, "w"))
    return [tuple(w) for w in json.load(open(out))]

def captions(cues, y=460, fs=60, per=3, fix=None):
    from PIL import ImageFont
    """Word-by-word captions: for each (t0, mp3), words appear one by one in groups of <= `per`,
    as drawtext filters (enable='between(t,..)') for the whole timeline. `fix` maps spoken -> shown words."""
    vf = []
    for t0, mp3 in cues:
        raw = words(mp3)
        groups, cur = [], []
        for w, s, e in raw:  # <= per words, and a new group after each sentence end
            cur.append(((fix or {}).get(w.strip(".,:;!?").lower(), w.rstrip(".,;:")), s, e))
            if len(cur) == per or w[-1:] in ".!?":
                groups.append(cur); cur = []
        groups += [cur] if cur else []
        for gi, grp in enumerate(groups):
            full = " ".join(w for w, _, _ in grp)
            size = min(fs, int(1000 / (0.62 * max(len(full), 1))))  # same rule as txt(), for the whole group
            x = int((1080 - ImageFont.truetype(FONT, size).getlength(full)) / 2)  # left edge pinned: no jiggle as words add
            end = t0 + grp[-1][2] + 0.25
            if gi + 1 < len(groups):
                end = min(end, t0 + groups[gi + 1][0][1])  # never overlap the next group
            for i, (_, s, _) in enumerate(grp):
                a = t0 + s
                b = t0 + grp[i + 1][1] if i + 1 < len(grp) else end
                vf.append(txt(" ".join(w for w, _, _ in grp[:i + 1]), y, size).replace("x=(w-text_w)/2", f"x={x}")
                          + f":enable='gte(t,{a:.2f})*lt(t,{b:.2f})'")
    return vf

def _audio(say, seconds):
    """Audio input args + segment length: the narration line (beat stretched to fit it) or silence."""
    if not say:
        return SILENT, seconds
    path, d = tts(say)
    return ["-i", path], max(seconds, d + 0.4)

class Cut:
    def __init__(self):
        self.segs = []
    def seg(self, inputs, vf, seconds, say=None):
        out = os.path.join(TMP, f"s{len(self.segs)}.mp4")
        audio, seconds = _audio(say, seconds)
        subprocess.run([FFMPEG, "-v", "error", "-y", *inputs, *audio, "-vf", vf, "-af", "apad", "-map", "0:v", "-map", "1:a",
                        "-t", str(seconds), *ENC, out], check=True)
        self.segs.append(out)
    def seg_fc(self, inputs, fc, seconds, say=None):
        """Like seg, but a -filter_complex over several inputs that ends in [v]."""
        out = os.path.join(TMP, f"s{len(self.segs)}.mp4")
        n = sum(1 for x in inputs if x == "-i")
        audio, seconds = _audio(say, seconds)
        subprocess.run([FFMPEG, "-v", "error", "-y", *inputs, *audio, "-filter_complex", fc + f";[{n}:a]apad[au]", "-map", "[v]", "-map", "[au]",
                        "-t", str(seconds), *ENC, out], check=True)
        self.segs.append(out)
    def save(self, out, bed=False):
        """bed=True lays a synthesized ambient drone under the cut (no music licence needed)."""
        lst = os.path.join(TMP, "list.txt")
        open(lst, "w").write("".join(f"file '{s}'\n" for s in self.segs))
        cat = os.path.join(TMP, "cat.mp4") if bed else out
        subprocess.run([FFMPEG, "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy",
                        "-movflags", "+faststart", cat], check=True)
        if bed:
            d = _dur(cat)
            drone = ("aevalsrc='0.10*sin(2*PI*55*t)+0.06*sin(2*PI*82.4*t)*(0.6+0.4*sin(2*PI*0.25*t))+0.03*sin(2*PI*220*t)*(0.5+0.5*sin(2*PI*0.5*t))'"
                     f":s=44100:d={d:.2f}")
            fc = (f"[1:a]aformat=channel_layouts=stereo[a];[2:a]lowpass=f=400,volume=0.6,aformat=channel_layouts=stereo[n];[a][n]amix=inputs=2:normalize=0,"
                  f"afade=t=in:d=1,afade=t=out:st={d - 1.5:.2f}:d=1.5,volume=0.9[bed];[0:a][bed]amix=inputs=2:normalize=0[mix]")
            subprocess.run([FFMPEG, "-v", "error", "-y", "-i", cat, "-f", "lavfi", "-i", drone, "-f", "lavfi", "-i",
                            f"anoisesrc=color=brown:amplitude=0.05:d={d:.2f}", "-filter_complex", fc, "-map", "0:v", "-map", "[mix]",
                            "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", out], check=True)
        print("wrote", out, os.path.getsize(out) // 1024, "KB")
