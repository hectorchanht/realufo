"""Short for the "Area 51" article: the CIA's U-2/OXCART history (CIA-UAP-003: Groom Lake = "Area 51"
p.69; U-2s caused "a tremendous increase" in UFO reports p.85; U-2/OXCART = "more than one-half of all
UFO reports" p.86), Bob Lazar's S-4 claims (element 115, made 2003, decays in < 1 s), AARO's 2024 review
("no evidence" p.7; KONA BLUE spacecraft "they hoped to acquire" p.34, rejected "for lacking merit"
p.35), Oak Ridge's test of the "1947 crash metal" ("terrestrial in origin" p.1). The glinting U-2 at
dusk is a labelled ffmpeg illustration; everything else is the released documents, highlighted.
ElevenLabs narration over a synthesized ambient bed; app-screenshot how-to. 9:16.

    FFMPEG=/path/to/ffmpeg-with-drawtext CLIP_FONT=/path/Bold.ttf python3 showcase/articles/area-51/short.py
"""
import os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", ".."))
IMG = os.path.join(HERE, "..", "images")  # stills; app-*.png + short.mp4 live here in short/
from lib import Cut, txt, FFMPEG, TMP

P = lambda f: os.path.join(IMG if f.endswith(".jpg") else HERE, f)
OUT = P("short.mp4")
SKY, GLINT = os.path.join(TMP, "dusk.png"), os.path.join(TMP, "glint.png")
# dusk: deep blue above, orange glow at the horizon (sun just set), a dark ridge line
subprocess.run([FFMPEG, "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=black:s=1080x1080", "-vf",
                "geq=r='clip(8+200*pow(Y/1080,3),0,255)':g='clip(12+90*pow(Y/1080,3),0,255)':b='clip(40+30*(1-Y/1080),0,255)',"
                "drawbox=x=0:y=930:w=1080:h=150:c=0x0a0a10:t=fill", "-frames:v", "1", SKY], check=True)
subprocess.run([FFMPEG, "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=black@0:s=120x120,format=rgba", "-vf",
                "geq=r='255':g='235':b='200':a='255*(exp(-((X-60)*(X-60)+(Y-60)*(Y-60))/40)+0.35*exp(-abs(Y-60)/2)*exp(-abs(X-60)/40))'",
                "-frames:v", "1", GLINT], check=True)

def top(a, b, b_color="yellow", c=None):
    return [txt(a, 215, 70), txt(b, 300, 60, b_color)] + ([txt(c, 375, 44)] if c else [])

def glint(lines, secs, say):
    """Illustration: a sunlit U-2 glinting high in a dusk sky, drifting slowly."""
    fc = ("[1:v]format=rgba[g];[0:v][g]overlay=x='250+t*60':y='220-t*6':format=auto,fps=30,pad=1080:1920:0:450:black,"
          + ",".join([*lines, txt("illustration", 1450, 34, "gray")]) + "[v]")
    c.seg_fc(["-loop", "1", "-i", SKY, "-loop", "1", "-i", GLINT], fc, secs, say=say)

def page(img, lines, secs, say):
    """A highlighted document crop, as large as fits; panned when wider than the frame."""
    vf = ["scale=w='min(1640,iw*1060/ih)':h=-2", "pad=iw+40:ih+40:20:20:white",
          f"crop='min(1080,iw)':ih:x='(iw-ow)*min(t/{secs},1)':y=0", "fps=30",
          "pad=1080:1920:(ow-iw)/2:450+(1100-ih)/2:black", *lines]
    c.seg(["-loop", "1", "-i", img], ",".join(vf), secs, say=say)

c = Cut()
glint(top("Area 51:", "where UFO legends live"), 3.5,
      "Area 51, home of the UFO legends. Here's what the government files actually say.")
page(P("cia-area51.jpg"), top("1955, CIA history:", "\"known ... as Area 51\"", c="Groom Lake, for the U-2 · p.69"), 4.5,
     "In 1955 the CIA picked a Nevada dry lake to test its U-2 spy plane. Map name: Area 51.")
glint(top("U-2 at 60,000 ft", "catches the sunset", c="pilots saw \"fiery objects\" · p.85"), 4,
      "The U-2 flew so high it caught the sunset. Pilots below saw fiery objects.")
page(P("cia-half.jpg"), top("The CIA's verdict:", "over HALF of UFO reports", c="were U-2 and OXCART flights · p.86"), 4.5,
     "The CIA's own history: its planes were over half of all UFO reports.")
glint(top("S-4, 1989: Bob Lazar", "\"reverse-engineered\" alien craft", c="his element 115 decays in under a second"), 4.5,
      "Bob Lazar claimed he reverse-engineered alien craft at S-4. His element 115 decays in under a second.")
page(P("hrr-no-evidence.jpg"), top("Pentagon review, 2024:", "\"no evidence\"", c="of alien technology · p.7"), 3.5,
     "The Pentagon's 2024 review: no evidence of alien technology.")
page(P("hrr-kona-a.jpg"), top("The only real plan:", "spacecraft they", c="\"hoped to acquire\" · KONA BLUE · p.34"), 4,
     "The only real reverse-engineering plan was for spacecraft they hoped to acquire.")
page(P("hrr-kona-b.jpg"), top("DHS:", "\"lacking merit\"", c="rejected · p.35"), 2.5,
     "Rejected, for lacking merit.")
page(P("ornl.jpg"), top("The 1947 \"crash metal\"?", "\"terrestrial in origin\"", c="Oak Ridge lab test · p.1"), 3.5,
     "And the famous crash metal? Oak Ridge tested it. Made on Earth.")
c.seg(["-loop", "1", "-i", P("app-search.png")], ",".join(["crop=860:1080:0:140,scale=1080:1356,fps=30,pad=1080:1920:0:450:black",
      txt("Read the CIA's own history:", 215, 62), txt("search \"OXCART\" on realufo.org", 300, 54, "yellow")]), 3.5,
      say="Read the CIA's own history on real U F O dot org.")
glint([txt("Alien tech", 215, 72), txt("or spy planes?", 300, 70, "yellow"), txt("realufo.org", 380, 50)], 3,
      "Alien tech, or spy planes? You decide.")
c.save(OUT, bed=True)
