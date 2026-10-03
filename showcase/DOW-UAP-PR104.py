"""Showcase Short for DOW-UAP-PR104 (Unresolved UAP Report, Yellow Sea, 2025): a black-hot IR
"six-pointed star", explained with the site's filters and the physics. Beats: original → Invert IR
(black-hot = darker is hotter) → + Ironbow (one tiny, very hot core = the optics' point-spread
function) → why six points (diffraction spikes from the camera's own aperture/struts) → spike angles
never change (camera, not craft?) → "Object or optics?" end card with a deep link that opens the doc
page with the same filters. Official status: unresolved, so the copy says "consistent with", not
"is". Square crop on the star (the sensor keeps it centred). 9:16, ~23 s.

    FFMPEG=/path/to/ffmpeg-with-drawtext CLIP_FONT=/path/Bold.ttf python3 showcase/DOW-UAP-PR104.py
"""
import os
from lib import Cut, txt, SITE, IRONBOW

U = "https://assets.realufo.org/videos/wargov/DOD_111830027.mp4"  # 1920x1080, 30 fps, 15.67 s
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "DOW-UAP-PR104.mp4")
CROP = "crop=1080:1080:400:0"  # star sits ~(940,470) in 1920x1080; the sensor keeps it centred
PAD = "pad=1080:1920:0:420:black"  # after the filters, so they don't tint the bands
INV = "negate"
HOT = [INV, IRONBOW]

def beat(c, start, secs, filters, top1, top2, top2_color="white", bottom=None, top3=None):
    vf = [CROP, "fps=30", *filters, PAD, txt(top1, 210, 74), txt(top2, 300, 66, top2_color)]
    if top3:
        vf.append(txt(top3, 1330, 56))  # third line rides low on the video, above realufo.org
    vf += bottom or [SITE()]
    c.seg(["-ss", str(start), "-i", U], ",".join(vf), secs)

c = Cut()
beat(c, 0, 4, [], "A 'six-pointed star'", "over the Yellow Sea", bottom=[txt("black-hot infrared, 2025", 1560, 46, "#cccccc"), SITE()])
beat(c, 4, 4, [INV], "Black-hot IR:", "darker = hotter", "white", top3="INVERT IR → white-hot")
beat(c, 8, 4, HOT, "IRONBOW: heat → colour", "one tiny, very hot core", "yellow")
beat(c, 12, 3.6, HOT, "Why 6 points?", "Diffraction spikes", "yellow", top3="from the camera's own optics")
beat(c, 0, 4, HOT, "Same spike angles", "in every frame", "white", top3="camera, not craft?")
beat(c, 4, 3.4, HOT, "Object or optics?", "Try the filters. Cast your verdict.", "white",
     bottom=[txt("realufo.org/doc/DOW-UAP-PR104", 1420, 50, "yellow"), txt("DOW-UAP-PR104  ·  Yellow Sea, 2025", 1500, 42)])
c.save(OUT)
