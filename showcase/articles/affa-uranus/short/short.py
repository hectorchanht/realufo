"""Short "AFFA from Uranus": the FBI's 1954 file on Mrs. Frances Swan of South Berwick, Maine (FBI file 62-HQ-83894,
Section 8). A retired admiral's neighbour gets "messages through thought transmission" (Hoover to Air Force OSI,
9 Aug 1954, p.17); a Navy Bureau of Aeronautics security officer and Canadian government physicist Wilbert B. Smith
sit in and watch her write (p.14); the sender is "AFFA", commander of ship M-4 "from the planet Uranus" (p.15);
Smith will try radio contact "Sunday, August 1, 1954" with a ship "within 100 miles of Ottawa" (p.15); saucers to
appear "over many nations of the world during the latter part of August 1954" (p.16); FBI: "no further action"
(p.16). AARO 2024 (Historical Record Report Vol. 1 p.26): Smith "believed he was in personal contact with
extraterrestrial beings through telepathy". Document crops (images/crops.py) + one app screenshot, no illustration.

    FFMPEG=/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg CLIP_FONT=~/Library/Fonts/DejaVuSans-Bold.ttf \
      python3 showcase/articles/affa-uranus/short/short.py
"""
import os, sys, textwrap
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", ".."))
IMG = os.path.join(HERE, "..", "images")
from lib import Cut, txt, stamp
from PIL import Image

P = lambda f: os.path.join(IMG if f.endswith(".jpg") else HERE, f)
OUT = P("short.mp4")
FBI = "FBI file 62-HQ-83894, Section 8"  # the record's title on the site (search finds it)
WHEN = "Jul-Aug 1954  ·  South Berwick, Maine  ·  Navy officer, FBI"
SUB_Y = 1210

def top(a, b, c=None):
    return [txt(a, 215, 66), txt(b, 300, 58, "yellow")] + ([txt(c, 375, 42)] if c else [])

def subs(say):
    """One calm line per beat, our own words: speech-to-text subtitles misheard "Affa" as "Alpha"."""
    return [txt(l, SUB_Y + 54 * i, 44) for i, l in enumerate(textwrap.wrap(say, 32))]

def page(img, lines, secs, say, src=FBI, ctx=WHEN, caption=True, box=False):
    """A highlighted document crop, as large as fits the band, slow push-in; optional yellow frame (tease)."""
    w, h = Image.open(img).size
    k = min(1040 / w, 520 / h, 2.0)  # as large as the band allows, at most 2x the 220-dpi scan
    W, H = int(w * k) // 2 * 2, int(h * k) // 2 * 2
    y0 = 620 + (560 - H) // 2
    vf = [f"scale={W}:{H}", f"zoompan=z='1+0.04*on/({secs}*30)':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s={W}x{H}:fps=30",
          f"pad=1080:1920:{(1080 - W) // 2}:{y0}:black",
          *([f"drawbox=x={(1080 - W) // 2 - 10}:y={y0 - 10}:w={W + 20}:h={H + 20}:c=yellow:t=8"] if box else []),
          *lines, stamp(src, ctx)]
    vf += subs(say) if caption else []
    c.seg(["-loop", "1", "-framerate", "30", "-i", img], ",".join(vf), secs, say=say)

def app(lines, secs, say):
    """The archive search for "Frances Swan": 1 record, the card quoting p.17; yellow box on the snippet."""
    vf = ["crop=860:740:0:760", "scale=1032:-2", "pad=1080:1920:24:450:black",
          "drawbox=x=78:y=1170:w=520:h=112:c=yellow:t=6", *lines, stamp(FBI, WHEN)]  # no caption: it would cover the box
    c.seg(["-loop", "1", "-i", P("app-swan.png")], ",".join(vf), secs, say=say)

TEASE = top("Hoover's file, 1954:", "\"FLYING SAUCERS; MRS. SWAN\"", "who was she talking to?")
c = Cut()
# frame 0: the tease (no subtitles), yellow frame on Hoover's subject line
page(P("hoover-subject.jpg"), TEASE, 2.5, "Nineteen fifty-four. Hoover gets a strange file.", caption=False, box=True)
page(P("thought.jpg"), top("A retired admiral reports:", "messages from space", "\"through thought transmission\" · p.17"), 2.8,
     "Messages from space. By thought.")
page(P("observe.jpg"), top("The Navy came to watch:", "she wrote messages", "from \"outer space\" · p.14"), 2.8,
     "A Navy officer watched her write them.")
page(P("smith.jpg"), top("Also in the room:", "a Canadian government", "physicist, Wilbert Smith · p.14"), 2.8,
     "So did a Canadian government scientist.")
page(P("affa.jpg"), top("The sender:", "\"AFFA\", from Uranus", "commander of ship M-4 · p.15"), 2.8,
     "The sender? Affa. From Uranus.")
page(P("aug1.jpg"), top("The test:", "August 1, 1954", "a ship near Ottawa · p.15"), 2.8,
     "The test: August first. Near Ottawa.")
page(P("prophecy.jpg"), top("The prophecy:", "saucers over many nations", "late August 1954 · p.16"), 3,
     "Then saucers over many nations.")
page(P("nofurther.jpg"), top("August came and went.", "\"no further action\"", "the FBI's last line · p.16"), 3,
     "August came and went. No further action.")
page(P("aaro-telepathy.jpg"), top("Pentagon, 2024:", "Smith \"believed\" it", "Files prove belief, not aliens · p.26"), 3.2,
     "The Pentagon: he believed it. Belief isn't proof.",
     src="AARO Historical Record Report p.26", ctx="AARO  ·  2024  ·  on Wilbert Smith")
app(top("Read it yourself:", "search \"Frances Swan\"", "on realufo.org · FBI file p.14"), 3,
    "Read the F B I file yourself. Search Frances Swan.")
# loop: back on the frame-0 image
page(P("hoover-subject.jpg"), TEASE, 2, "On real U F O dot org.", box=True)
c.save(OUT, bed=True)
