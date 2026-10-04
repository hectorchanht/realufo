"""Short "Men in Black": what the FBI's own UFO file (62-HQ-83894) says.
- Section 5 p.154: the "captured alien" photo (two military policemen + "Mister X"); p.153: Army CID, New Orleans,
  22 May 1950, bought "for the sum of $1.00", "The 'man from Mars' was pictured as being in the custody of two military
  policemen"; "The location of both photographs was stated to be Wiesbaden, Germany."
- Background (not in the file): Wiesbadener Tagblatt April Fools' photo, 1 April 1950 (hoaxes.org, patrickgross.org).
- Section 10 p.147 (Oct 1969): Ontario UFO club kids (13 and 12) ask if "the two men were FBI agents who had captured
  this man"; p.145 Hoover: "I can assure you the photograph you mentioned does not represent employees of this Bureau."
- Section 9 p.83 (Jan 1959): Bender "knew what the saucers are"; "3 men in black suits" silenced him; "The Bureau
  desires to obtain a copy of the book written by Gray Barker entitled 'They Knew Too Much About Flying Saucers'";
  p.74 (Dec 1958): "Bufiles contain no information pertaining to the 'Bender Affair'".
Document crops + the photo (images/crops.py) + one app screenshot. 9:16, narration over the ambient bed.

    FFMPEG=/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg CLIP_FONT=~/Library/Fonts/DejaVuSans-Bold.ttf \
      python3 showcase/articles/men-in-black/short/short.py
"""
import os, sys, textwrap
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", ".."))
IMG = os.path.join(HERE, "..", "images")
from lib import Cut, txt, stamp
from PIL import Image

P = lambda f: os.path.join(IMG if f.endswith(".jpg") else HERE, f)
OUT = P("short.mp4")
S5 = ("FBI file 62-HQ-83894, Section 5", "May 1950  ·  New Orleans  ·  Army CID, FBI")
S9 = ("FBI file 62-HQ-83894, Section 9", "Dec 1958 - Jan 1959  ·  FBI HQ  ·  \"Bender Affair\"")
S10 = ("FBI file 62-HQ-83894, Section 10", "Oct 1969  ·  Ajax, Ontario  ·  J. Edgar Hoover")

def top(a, b, c=None):
    return [txt(a, 215, 66), txt(b, 300, 58, "yellow")] + ([txt(c, 375, 42)] if c else [])

def subs(say, y):
    """One calm line per beat, our own words (speech-to-text mangles names)."""
    return [txt(l, y + 54 * i, 44) for i, l in enumerate(textwrap.wrap(say, 32))]

def still(img, lines, secs, say, rec, band=(620, 560), box=None, caption=True, sub_y=1210):
    """A still, as large as the band allows (<=2x), slow push-in; box = (x0, y0, x1, y1) in image pixels."""
    w, h = Image.open(img).size
    k = min(1040 / w, band[1] / h, 2.0)
    W, H = int(w * k) // 2 * 2, int(h * k) // 2 * 2
    x0, y0 = (1080 - W) // 2, band[0] + (band[1] - H) // 2
    vf = [f"scale={W}:{H}", f"zoompan=z='1+0.04*on/({secs}*30)':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s={W}x{H}:fps=30",
          f"pad=1080:1920:{x0}:{y0}:black"]
    if box:
        bx, by, bx1, by1 = (int(v * k) for v in box)
        vf.append(f"drawbox=x={x0 + bx}:y={y0 + by}:w={bx1 - bx}:h={by1 - by}:c=yellow:t=8")
    vf += [*lines, stamp(*rec)] + (subs(say, sub_y) if caption else [])
    c.seg(["-loop", "1", "-framerate", "30", "-i", img], ",".join(vf), secs, say=say)

PHOTO = dict(band=(440, 800), sub_y=1262)   # the portrait photo gets the tall band
MRX = (250, 480, 450, 1000)                  # "Mister X" in photo-mrx.jpg

def app(lines, secs, say):
    """Archive search "men in black suits": 2 records, Section 9's card quotes p.82; yellow box on the snippet."""
    vf = ["crop=860:740:0:760", "scale=1032:-2", "pad=1080:1920:24:450:black",
          "drawbox=x=56:y=1186:w=548:h=96:c=yellow:t=6", *lines, stamp(*S9)]
    c.seg(["-loop", "1", "-i", P("app-mib.png")], ",".join(vf), secs, say=say)

TEASE = top("Two agents. One alien?", "It's in the FBI's file", "who are these men?")
c = Cut()
# frame 0: the tease (no subtitles), yellow box on "Mister X"
still(P("photo-mrx.jpg"), TEASE, 2.5, "Two agents. One captured alien. It's in the F B I file.", S5, box=MRX, caption=False, **PHOTO)
still(P("sold.jpg"), top("New Orleans, May 1950:", "sold for $1.00", "a \"man from Mars\" · p.153"), 2.8,
      "New Orleans, 1950. Someone sells this photo for one dollar.", S5)
still(P("wiesbaden.jpg"), top("The Army traced it:", "Wiesbaden, Germany", "military police, not agents · p.153"), 2.8,
      "The Army traced it to Wiesbaden, Germany.", S5)
still(P("photo-clipping.jpg"), top("A German newspaper:", "an April Fools' joke", "Wiesbadener Tagblatt, 1 Apr 1950"), 2.8,
      "A newspaper's April Fools' joke.", S5, band=(440, 800), sub_y=1262)
still(P("kids.jpg"), top("1969: kids ask the FBI:", "\"FBI agents\"?", "a UFO club, ages 12 and 13 · p.147"), 2.8,
      "Nineteen sixty-nine. Kids ask: are those F B I agents?", S10)
still(P("hoover.jpg"), top("Hoover's answer:", "\"not employees", "of this Bureau\" · p.145"), 2.8,
      "Hoover himself: not our men.", S10)
still(P("black-suits.jpg"), top("Meanwhile, the legend:", "\"3 men in black suits\"", "silenced a saucer hunter · p.83"), 3,
      "Meanwhile, a legend: three men in black suits.", S9)
still(P("no-info.jpg"), top("The FBI checked its files:", "\"no information\"", "on the \"Bender Affair\" · p.74"), 2.8,
      "The F B I checked. Nothing.", S9)
still(P("book.jpg"), top("So the FBI", "ordered the book", "the Men in Black came from it · p.83"), 3,
      "So the F B I ordered the book. Even the F B I wanted to know.", S9)
app(top("Read it yourself:", "search \"men in black suits\"", "on realufo.org · FBI file p.82"), 3,
    "Search men in black suits on real U F O dot org.")
# loop: back on the frame-0 image
still(P("photo-mrx.jpg"), TEASE, 2, "Who are these men?", S5, box=MRX, **PHOTO)
c.save(OUT, bed=True)
