"""Short for the "teardrop twins" article: DOW-UAP-PR028 (Greece, Jan 2024) and DOW-UAP-PR029
(Gulf of Oman, Jun 2024), two crews, same round body with a rigid tail hanging straight down.
Hook → each clip → side by side → the crews' own words → why (gravity, parallax) → how to check
it on realufo.org (real app screenshot) → end card. ElevenLabs narration (lib.tts) over a synthesized ambient bed. 9:16, ~35 s.

    FFMPEG=/path/to/ffmpeg-with-drawtext CLIP_FONT=/path/Bold.ttf python3 showcase/articles/teardrop-twins/short.py
"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", ".."))
from lib import Cut, txt, SITE

PR028 = "https://assets.realufo.org/videos/wargov/DOD_111688954.mp4"  # 1920x1080, object ~(970,470) at 15 s
PR029 = "https://assets.realufo.org/videos/wargov/DOD_111688964.mp4"  # 1920x1080, object ~(1090,518) at 5.4 s
A, B = os.path.join(HERE, "DOW-UAP-PR028.jpg"), os.path.join(HERE, "DOW-UAP-PR029.jpg")
APP = os.path.join(HERE, "app-search.png")  # 860x1864 mobile screenshot of /archive?q=teardrop&type=video
OUT = os.path.join(HERE, "short.mp4")

def top(a, b, b_color="yellow", c=None):
    return [txt(a, 215, 70), txt(b, 300, 64, b_color)] + ([txt(c, 375, 48)] if c else [])

SQ = "scale=1080:1080:flags=lanczos,fps=30,pad=1080:1920:0:470:black"
def pair(lines, secs, tags=("Greece · Jan 2024", "Gulf of Oman · Jun 2024"), say=None):
    """Both close-ups stacked (2 x 1080x500 bands), labelled."""
    fc = (f"[0:v]scale=1080:1080,crop=1080:500:0:290[a];[1:v]scale=1080:1080,crop=1080:500:0:290[b];"
          f"[a][b]vstack=2,pad=1080:1920:0:450:black,"
          + ",".join([*lines, txt(tags[0], 470, 40), txt(tags[1], 970, 40)]) + "[v]")
    c.seg_fc(["-loop", "1", "-i", A, "-loop", "1", "-i", B], fc, secs, say=say)

c = Cut()
c.seg(["-ss", "14", "-i", PR028], ",".join(["crop=420:420:760:280", SQ, *top("Two military crews", "3,000 km apart"), SITE()]), 3.5, say="Two military crews, three thousand kilometres apart.")
c.seg(["-ss", "15", "-i", PR028], ",".join(["crop=420:420:760:280", SQ, *top("Greece, Jan 2024", "round thing + rigid 'tail'"), SITE()]), 3, say="Greece, January twenty twenty-four. A round object, with a rigid tail.")
c.seg(["-ss", "3.6", "-i", PR029], ",".join(["crop=420:420:880:300", SQ, *top("Gulf of Oman, Jun 2024", "...the same thing?!"), SITE()]), 3, say="Then, over the Gulf of Oman... the same thing.")
pair(top("Same shape.", "Same straight-down tail."), 3.5, say="Same shape. Same tail, hanging straight down.")
pair([txt("Crew 1: \"NON MANEUVERABLE TAIL\"", 230, 50), txt("Crew 2: \"UNWAVERING POLE/BAR\"", 310, 50, "yellow")], 4, say="One crew wrote: non-maneuverable tail. The other: unwavering pole.")
pair(top("The tail ALWAYS points down", "= gravity", c="like a payload under a balloon?"), 4.5, say="Frame by frame, the tail always points down. That's gravity. Like a payload under a balloon.")
pair([txt("Crew 1 said \"434 knots\"?", 215, 64), txt("motion parallax:", 295, 60, "yellow"),
      txt("far + slow looks fast from a jet", 370, 46)], 4.5, say="Four hundred thirty-four knots? From a fast jet, far and slow looks fast. It's called motion parallax.")
c.seg(["-loop", "1", "-i", APP], ",".join(["crop=860:1080:0:140,scale=1080:1356,fps=30,pad=1080:1920:0:450:black",
      txt("Check it yourself:", 215, 70), txt("search \"teardrop\" on realufo.org", 300, 56, "yellow")]), 4, say="Check it yourself. Search teardrop on real U F O dot org.")
c.seg(["-loop", "1", "-i", A], ",".join(["scale=1080:1080,fps=30,pad=1080:1920:0:470:black",
      txt("Object or balloon?", 215, 74), txt("realufo.org", 300, 70, "yellow"), txt("step it frame by frame, free", 380, 46)]), 3, say="Object, or balloon? You decide.")
c.save(OUT, bed=True)
