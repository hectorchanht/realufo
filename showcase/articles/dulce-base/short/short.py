"""Short for the "Dulce Base" article: our archive search for "Dulce" returns 0 records; the 1999 French
COMETA report names the source (Bennewitz's "pulsed microwaves" from Kirtland, AFOSI "special agent Doty"
who "induced him to make fantastic 'revelations'" p.74; it "probably permitted the protection of research
on microwave weapons at Kirtland" p.75); the CIA's U-2 history (14 Apr 1956, a secret U-2 at Kirtland, the
pilot "looked like a man from Mars" p.92); AARO 2024 "circular reporting" (p.9; AARO never names Dulce).
Document crops + app screenshot only, no illustration. ElevenLabs narration over the ambient bed, calm
subtitles, record watermark per beat. 9:16.

    FFMPEG=/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg CLIP_FONT=~/Library/Fonts/DejaVuSans-Bold.ttf \
      python3 showcase/articles/dulce-base/short/short.py
"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", ".."))
IMG = os.path.join(HERE, "..", "images")  # stills; app-*.png + short.mp4 live here in short/
from lib import Cut, txt, tts, subtitles

P = lambda f: os.path.join(IMG if f.endswith(".jpg") else HERE, f)
OUT = P("short.mp4")
APP = P("app0.png")  # from app-Dulce.png (/archive?q=Dulce): search box + "0 RECORDS · no records match", zoomed 1.6x
SUB_Y = 1250              # calm subtitles below the document band; watermark at 1420

def top(a, b, c=None):
    return [txt(a, 215, 66), txt(b, 300, 58, "yellow")] + ([txt(c, 375, 42)] if c else [])

def mark(src):
    return txt(f"realufo.org  ·  {src}", 1420, 34, "gray")

def subs(say):
    return subtitles([(0, tts(say)[0])], y=SUB_Y, fs=44)

def page(img, lines, src, secs, say):
    """A highlighted document crop, as large as fits; panned when wider than the frame."""
    vf = ["scale=w='min(1640,iw*1060/ih)':h=-2", "pad=iw+40:ih+40:20:20:white",
          f"crop='min(1080,iw)':ih:x='(iw-ow)*min(t/{secs},1)':y=0", "fps=30",
          "pad=1080:1920:(ow-iw)/2:620+(500-ih)/2:black", *lines, mark(src), *subs(say)]
    c.seg(["-loop", "1", "-i", img], ",".join(vf), secs, say=say)

def app(lines, secs, say, caption=True, box=True):
    """The archive search for "Dulce": search box + "0 RECORDS" + "no records match", yellow box on the 0."""
    vf = ["fps=30,pad=1080:1920:0:620:black",
          *(["drawbox=x=0:y=806:w=240:h=58:c=yellow:t=6"] if box else []), *lines, mark("search \"Dulce\"")]
    vf += subs(say) if caption else []
    c.seg(["-loop", "1", "-i", APP], ",".join(vf), secs, say=say)

c = Cut()
# frame 0: the tease (no subtitles); the yellow box sits on "0 RECORDS"
app(top("Secret alien base at Dulce?", "Government files: 0 results"), 3,
    "A secret alien base under Dulce? The government's U F O files: zero results.", caption=False)
page(P("cometa-bennewicz.jpg"), top("1979, near Kirtland AFB:", "\"pulsed microwaves\"", "a physicist blames UFOs · p.74"),
     "COMETA report p.74", 3.5, "Nineteen seventy-nine: a physicist blames U F Os for strange microwaves.")
page(P("cometa-doty.jpg"), top("The Air Force noticed:", "agent Doty \"induced him\"", "to make \"fantastic revelations\" · p.74"),
     "COMETA report p.74", 3.5, "A French defence report says an Air Force agent fed him fantastic stories.")
page(P("cometa-microwave.jpg"), top("Why? To protect", "\"microwave weapons\" research", "Real secrets. Fake aliens. · p.75"),
     "COMETA report p.75", 3.5, "Why? To hide real weapons research. Real secrets. Fake aliens.")
page(P("cia-mars.jpg"), top("Same base, 1956:", "\"a man from Mars\"", "a secret U-2 pilot · CIA history p.92"),
     "CIA-UAP-003 p.92", 3.5, "Same base, nineteen fifty-six: a secret spy pilot looked like a man from Mars.")
page(P("hrr-circular.jpg"), top("Pentagon, 2024:", "\"circular reporting\"", "one story, retold until it sounds true · p.9"),
     "AARO report p.9", 3, "The Pentagon's name for it: circular reporting.")
app([txt("Read it yourself:", 215, 66), txt("search \"COMETA\"", 300, 62, "yellow"), txt("on realufo.org · p.74", 375, 44)], 3,
    "Read the French report: search COMETA on real U F O dot org.", caption=False, box=False)  # STT hears "Kameda"; words are on screen
# loop: back on the frame-0 image
app(top("Base under Dulce?", "Vote: realufo.org"), 2.5, "Base under Dulce? Vote on real U F O dot org.")
c.save(OUT, bed=True)
