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
    def save(self, out):
        lst = os.path.join(TMP, "list.txt")
        open(lst, "w").write("".join(f"file '{s}'\n" for s in self.segs))
        subprocess.run([FFMPEG, "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy",
                        "-movflags", "+faststart", out], check=True)
        print("wrote", out, os.path.getsize(out) // 1024, "KB")
