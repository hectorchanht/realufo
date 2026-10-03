"""Showcase Short for DOW-UAP-PR104 (Unresolved UAP Report, Yellow Sea, 2025): black-hot IR, so the
"six-pointed star" is a dark smudge until the site's filters flip it. Cut: original → Invert IR →
Invert IR + Ironbow → end card with a deep link that opens the doc page with those filters on.
Square crop on the star (it stays centred: the sensor tracks it). 9:16, ~17 s.

    FFMPEG=/path/to/ffmpeg-with-drawtext CLIP_FONT=/path/Bold.ttf python3 showcase/DOW-UAP-PR104.py
"""
import os
from lib import Cut, txt, SITE, IRONBOW

U = "https://assets.realufo.org/videos/wargov/DOD_111830027.mp4"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "DOW-UAP-PR104.mp4")
CROP = "crop=1080:1080:400:0"  # star sits ~(940,470) in 1920x1080; the sensor keeps it centred
PAD = "pad=1080:1920:0:420:black"  # after the filters, so they don't tint the bands
INV = "negate"

c = Cut()
c.seg(["-ss", "0", "-i", U], ",".join([CROP, "fps=30", PAD, txt("A 'six-pointed star'", 230, 76), txt("over the Yellow Sea", 320, 76),
      txt("black-hot infrared, 2025", 1560, 46, "#cccccc"), SITE()]), 5)
c.seg(["-ss", "5", "-i", U], ",".join([CROP, "fps=30", INV, PAD, txt("Same video, one click:", 230, 70), txt("INVERT IR", 320, 84, "yellow"), SITE()]), 4)
c.seg(["-ss", "9", "-i", U], ",".join([CROP, "fps=30", INV, IRONBOW, PAD, txt("+ IRONBOW palette", 230, 76, "yellow"),
      txt("the hot core pops", 320, 66), SITE()]), 5)
c.seg(["-ss", "14", "-i", U], ",".join([CROP, "fps=30", INV, IRONBOW, PAD, txt("Object or optics?", 230, 80), txt("Try the filters yourself", 320, 62),
      txt("realufo.org/doc/DOW-UAP-PR104", 1420, 50, "yellow"), txt("DOW-UAP-PR104  ·  Yellow Sea, 2025", 1500, 42)]), 3.2)
c.save(OUT)
