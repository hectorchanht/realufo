"""Showcase Short "Two stars, 12 years apart": DOW-UAP-PR104 (Yellow Sea, 2025, a black-hot IR
"six-pointed star") next to DOW-UAP-PR038 (Middle East, 2013, an "eight-pointed star with arms of
alternating length"). Same kind of craft? Then why different shapes? Diffraction spikes are drawn by
the camera's optics (aperture edges / mirror struts), so different sensors draw different stars.
Both are officially unresolved, so the copy says "object or optics?", not "it's optics".
Filters = the site's Invert IR + Ironbow; the end card points at both doc pages. 9:16, ~21 s.

    FFMPEG=/path/to/ffmpeg-with-drawtext CLIP_FONT=/path/Bold.ttf python3 showcase/DOW-UAP-PR104.py
"""
import os, subprocess
from lib import Cut, txt, SITE, IRONBOW, FFMPEG, TMP

PR104 = "https://assets.realufo.org/videos/wargov/DOD_111830027.mp4"  # 1920x1080, star centred ~(930,460)
PR038 = "https://assets.realufo.org/videos/wargov/DOD_111689051.mp4"  # 1920x1080 (4:3 + bars), star ~(1364,508) at 25.5 s
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "DOW-UAP-PR104.mp4")
HOT = "negate," + IRONBOW
S104, S038 = os.path.join(TMP, "s104.png"), os.path.join(TMP, "s038.png")
subprocess.run([FFMPEG, "-v", "error", "-y", "-ss", "6", "-i", PR104, "-frames:v", "1", S104], check=True)
subprocess.run([FFMPEG, "-v", "error", "-y", "-ss", "25.5", "-i", PR038, "-frames:v", "1", S038], check=True)

def top(a, b, b_color="white", c=None):
    t = [txt(a, 215, 74), txt(b, 300, 64, b_color)]
    return t + ([txt(c, 372, 50)] if c else [])

c = Cut()
SQ104 = "crop=1080:1080:400:0,fps=30"  # PR104 playing, square on the star
c.seg(["-ss", "0", "-i", PR104], ",".join([SQ104, "pad=1080:1920:0:420:black", *top("The Pentagon has 2", "'star' UAPs, 12 years apart", "yellow"), SITE()]), 3.2)
# PR038 at its sharpest: a still with a slow push-in (its star wanders near the frame's black bar)
c.seg(["-loop", "1", "-i", S038], ",".join(["crop=600:600:1054:208,scale=1080:1080",
      "zoompan=z='min(zoom+0.0012,1.12)':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=1080x1080:fps=30",
      "pad=1080:1920:0:420:black", *top("Middle East, 2013", "8 points", "yellow"), SITE()]), 3)
c.seg(["-ss", "4", "-i", PR104], ",".join([SQ104, "pad=1080:1920:0:420:black", *top("Yellow Sea, 2025", "6 points", "yellow"), SITE()]), 3)

def split(lines, secs, filt=HOT):
    """PR038 over PR104, both filtered, each panel labelled."""
    fc = (f"[0:v]crop=1080:620:570:198,{filt}[a];[1:v]crop=1080:620:400:160,{filt}[b];"
          f"[a][b]vstack=2,pad=1080:1920:0:430:black,"
          + ",".join([*lines, txt("2013 · Middle East · 8 points", 445, 44, "yellow"),
                      txt("2025 · Yellow Sea · 6 points", 1075, 44, "yellow")]) + "[v]")
    c.seg_fc(["-loop", "1", "-i", S038, "-loop", "1", "-i", S104], fc, secs)

split(top("Same kind of craft?", "Then why different shapes?"), 4)
split(top("Diffraction spikes:", "the camera draws the star", "yellow", "different optics → different star"), 4.5)
split([txt("Object or optics? Compare both:", 215, 66), txt("realufo.org/doc/DOW-UAP-PR038", 300, 50, "yellow"),
       txt("realufo.org/doc/DOW-UAP-PR104", 368, 50, "yellow")], 3.6)
c.save(OUT)
