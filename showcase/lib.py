"""Shared bits for showcase recipes: 9:16 1080x1920, safe-zone text, 30 fps segments, concat.
Text sits below the app top tabs (~200 px) and above the caption/buttons area (bottom ~450 px)."""
import hashlib, json, os, re, subprocess, tempfile, urllib.request

FFMPEG = os.environ.get("FFMPEG", "ffmpeg")
FONT = os.environ.get("CLIP_FONT", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")
TMP = tempfile.mkdtemp(prefix="showcase-")
ENC = ["-r", "30", "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "20",
       "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2", "-shortest", "-movflags", "+faststart"]
SILENT = ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"]
_n = 0

def written(text):
    """Spoken spellings back to screen form: "F B I" -> "FBI", "real U F O dot org" -> "RealUFO.org"
    (narration spells letters out so the voice reads them; captions often reuse the narration line)."""
    text = re.sub(r"\b[A-Z](?: [A-Z](?=s?\b))+", lambda m: m.group(0).replace(" ", ""), text)
    return re.sub(r"\breal UFO dot org\b", "RealUFO.org", text, flags=re.I)

def txt(text, y, fs, color="white"):
    """drawtext via textfile= (quotes/colons in text can't break the filtergraph); centred, outline + shadow."""
    global _n
    _n += 1
    text = written(text)
    fs = min(fs, int(1000 / (0.62 * max(len(text), 1))))  # shrink long lines to fit the 1080 width
    p = os.path.join(TMP, f"t{_n}.txt")
    open(p, "w", encoding="utf-8").write(text)
    return (f"drawtext=fontfile={FONT}:fontcolor={color}:borderw=4:bordercolor=black:shadowcolor=black@0.6:"
            f"shadowx=2:shadowy=2:x=(w-text_w)/2:textfile={p}:expansion=none:fontsize={fs}:y={y}")

SITE = lambda: txt("realufo.org", 1420, 52)

def stamp(rid, ctx, y=1420):
    """Every-beat watermark, a drop-in for `site`: context line (when · where · who, e.g.
    "Nov 1979  ·  Manises, Spain  ·  airliner crew") over "realufo.org  ·  <ID>"."""
    return ",".join([txt(ctx, y - 46, 34), txt(f"realufo.org  ·  {rid}", y, 52)])

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
VOICE = os.environ.get("ELEVENLABS_VOICE", "nPczCjzI2devNBz1zQrb")  # "Brian": deep, calm narrator (legacy; tts now uses Kokoro)
KOKORO_VENV = os.environ.get("KOKORO_VENV", os.path.expanduser("~/kokoro-venv"))
KOKORO_VOICE = os.environ.get("KOKORO_VOICE", "am_onyx")
KOKORO_SPEED = float(os.environ.get("KOKORO_SPEED", "1.1"))

def _dur(path):
    h, m, sec = subprocess.run([FFMPEG, "-i", path], capture_output=True, text=True).stderr.split("Duration: ")[1].split(",")[0].split(":")
    return int(h) * 3600 + int(m) * 60 + float(sec)

def tts(text):
    """Kokoro local narration → (wav path, seconds), cached in showcase/.tts by text + voice.
    Runs inside KOKORO_VENV (default ~/kokoro-venv) via showcase/kokoro_tts.py;
    no API key, no network. Same (path, seconds) contract as the old ElevenLabs version."""
    out = os.path.join(HERE, ".tts", "kokoro-" + hashlib.sha1(f"{KOKORO_VOICE}|{KOKORO_SPEED}|{text}".encode()).hexdigest()[:16] + ".wav")
    if not os.path.exists(out):
        py = os.path.join(KOKORO_VENV, "bin", "python")
        if not os.path.exists(py):
            raise SystemExit(f"Kokoro venv python missing: {py} (override with KOKORO_VENV)")
        os.makedirs(os.path.dirname(out), exist_ok=True)
        # Strip proxy vars: this VM's proxy config breaks httpx URL parsing inside
        # huggingface_hub, and the local snapshot needs no network anyway.
        env = {k: v for k, v in os.environ.items() if k.lower() not in ("https_proxy", "http_proxy", "no_proxy")}
        env["HF_HUB_OFFLINE"] = "1"
        proc = subprocess.run([py, os.path.join(HERE, "kokoro_tts.py"), "--out", out,
                               "--voice", KOKORO_VOICE, "--speed", str(KOKORO_SPEED)],
                              input=text, env=env, capture_output=True, text=True)
        if proc.returncode != 0 or not os.path.exists(out):
            raise SystemExit(f"Kokoro TTS failed: {((proc.stderr or '') + (proc.stdout or ''))[-2000:]}")
    return out, _dur(out)

def sfx(text, seconds, influence=0.6):
    """Local synthesized sound effect (no API): keyword-driven synthesis in
    showcase/synth_sfx.py — 'tick'/'click' → crisp transient; 'whoosh'/'flyby'/'zoom'
    → filtered-noise swell; 'impact'/'thud' → low thump; anything else → soft airy bed.
    Cached in showcase/.tts as sfx-local-<hash>.wav. `influence` kept for signature compat."""
    out = os.path.join(HERE, ".tts", "sfx-local-" + hashlib.sha1(f"{text}|{seconds}".encode()).hexdigest()[:16] + ".wav")
    if not os.path.exists(out):
        py = os.path.join(KOKORO_VENV, "bin", "python")
        if not os.path.exists(py):
            raise SystemExit(f"SFX venv python missing: {py} (override with KOKORO_VENV)")
        os.makedirs(os.path.dirname(out), exist_ok=True)
        # Strip proxy vars: this VM's proxy config breaks httpx URL parsing inside
        # huggingface_hub; synthesis needs no network anyway.
        env = {k: v for k, v in os.environ.items() if k.lower() not in ("https_proxy", "http_proxy", "no_proxy")}
        env["HF_HUB_OFFLINE"] = "1"
        proc = subprocess.run([py, os.path.join(HERE, "synth_sfx.py"), "--out", out,
                               "--seconds", str(seconds)],
                              input=text, env=env, capture_output=True, text=True)
        if proc.returncode != 0 or not os.path.exists(out):
            raise SystemExit(f"SFX synth failed: {((proc.stderr or '') + (proc.stdout or ''))[-2000:]}")
    return out

def words(mp3):
    """Word timings [(text, start, end)] of a narration wav via local faster-whisper
    (base.en, word-level timestamps; showcase/whisper_words.py runs inside KOKORO_VENV),
    cached next to it as .words.json. Drives subtitles().
    Same return shape as the old ElevenLabs scribe version; no API key, no network."""
    out = mp3[:-4] + ".words.json"
    if not os.path.exists(out):
        py = os.path.join(KOKORO_VENV, "bin", "python")
        if not os.path.exists(py):
            raise SystemExit(f"Whisper venv python missing: {py} (override with KOKORO_VENV)")
        # Strip proxy vars: this VM's proxy config breaks httpx URL parsing inside
        # huggingface_hub, and the local model snapshot needs no network anyway.
        env = {k: v for k, v in os.environ.items() if k.lower() not in ("https_proxy", "http_proxy", "no_proxy")}
        env["HF_HUB_OFFLINE"] = "1"
        if "WHISPER_MODEL" in os.environ:
            env["WHISPER_MODEL"] = os.environ["WHISPER_MODEL"]
        proc = subprocess.run([py, os.path.join(HERE, "whisper_words.py"), mp3],
                              env=env, capture_output=True, text=True)
        if proc.returncode != 0 or not proc.stdout.strip():
            raise SystemExit(f"whisper words failed: {((proc.stderr or '') + (proc.stdout or ''))[-2000:]}")
        json.dump(json.loads(proc.stdout), open(out, "w"))
    return [tuple(w) for w in json.load(open(out))]

def _split(ws, maxch):
    """Split a sentence's words into lines <= maxch chars at the most balanced point (commas preferred)."""
    text = lambda x: " ".join(w for w, _, _ in x)
    if len(text(ws)) <= maxch or len(ws) < 2:
        return [ws]
    half = len(text(ws)) / 2
    best = min(range(1, len(ws)), key=lambda i: abs(len(text(ws[:i])) - half) - (8 if ws[i - 1][0][-1:] in ",;:" else 0))
    return _split(ws[:best], maxch) + _split(ws[best:], maxch)

def subtitles(cues, y=460, fs=46, maxch=32):
    """Calm subtitles: for each (t0, mp3), one line per sentence (long ones split at the most balanced
    point, commas preferred), each shown whole until the next starts. drawtext filters for the whole timeline."""
    vf = []
    for t0, mp3 in cues:
        sentences, cur = [], []
        for w, s, e in words(mp3):
            w = "realufo.org" if w.lower().rstrip(".") == "realufo.org" else w
            cur.append((w, s, e))
            if w[-1:] in ".!?":
                sentences.append(cur); cur = []
        sentences += [cur] if cur else []
        lines = [ln for sen in sentences for ln in _split(sen, maxch)]
        for i, ln in enumerate(lines):
            a = t0 + ln[0][1]
            b = t0 + (lines[i + 1][0][1] if i + 1 < len(lines) else ln[-1][2] + 0.6)
            text = " ".join(w for w, _, _ in ln).rstrip(",;:")
            vf.append(txt(text, y, fs) + f":enable='gte(t,{a:.2f})*lt(t,{b:.2f})'")
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
