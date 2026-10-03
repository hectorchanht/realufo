"""Shared bits for showcase recipes: 9:16 1080x1920, safe-zone text, 30 fps segments, concat.
Text sits below the app top tabs (~200 px) and above the caption/buttons area (bottom ~450 px)."""
import os, subprocess, tempfile

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

class Cut:
    def __init__(self):
        self.segs = []
    def seg(self, inputs, vf, seconds):
        out = os.path.join(TMP, f"s{len(self.segs)}.mp4")
        subprocess.run([FFMPEG, "-v", "error", "-y", *inputs, *SILENT, "-vf", vf, "-map", "0:v", "-map", "1:a",
                        "-t", str(seconds), *ENC, out], check=True)
        self.segs.append(out)
    def seg_fc(self, inputs, fc, seconds):
        """Like seg, but a -filter_complex over several inputs that ends in [v]."""
        out = os.path.join(TMP, f"s{len(self.segs)}.mp4")
        n = sum(1 for x in inputs if x == "-i")
        subprocess.run([FFMPEG, "-v", "error", "-y", *inputs, *SILENT, "-filter_complex", fc, "-map", "[v]", "-map", f"{n}:a",
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
            h, m, sec = subprocess.run([FFMPEG, "-i", cat], capture_output=True, text=True).stderr.split("Duration: ")[1].split(",")[0].split(":")
            d = int(h) * 3600 + int(m) * 60 + float(sec)
            drone = ("aevalsrc='0.10*sin(2*PI*55*t)+0.06*sin(2*PI*82.4*t)*(0.6+0.4*sin(2*PI*0.25*t))+0.03*sin(2*PI*220*t)*(0.5+0.5*sin(2*PI*0.5*t))'"
                     f":s=44100:d={d:.2f}")
            fc = (f"[1:a]aformat=channel_layouts=stereo[a];[2:a]lowpass=f=400,volume=0.6,aformat=channel_layouts=stereo[n];[a][n]amix=inputs=2:normalize=0,"
                  f"afade=t=in:d=1,afade=t=out:st={d - 1.5:.2f}:d=1.5,volume=1.4[bed]")
            subprocess.run([FFMPEG, "-v", "error", "-y", "-i", cat, "-f", "lavfi", "-i", drone, "-f", "lavfi", "-i",
                            f"anoisesrc=color=brown:amplitude=0.05:d={d:.2f}", "-filter_complex", fc, "-map", "0:v", "-map", "[bed]",
                            "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", out], check=True)
        print("wrote", out, os.path.getsize(out) // 1024, "KB")
