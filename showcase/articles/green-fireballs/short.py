"""Short for the "green fireballs" article (angle: "do UFOs watch our nukes?"; D094 p.10, D154 p.3, D004 p.2/7/9/25, D017 p.4): 1948-50 green fireballs over the New Mexico atomic labs;
the secret Los Alamos conference of 16 Feb 1949 (DOE-UAP-D004: Teller, Bradbury, Reines, LaPaz, the
FBI); LaPaz's case (copper-green, flat paths, silent at 400 miles); Teller's "electron phenomenon";
plot twists (DOW-UAP-D017: no copper dispersion, the one sample "of local origin"; FBI file 1950:
LaPaz says half meteors, rest US guided missiles); today's take: bright meteors. No footage exists:
the fireball is a labelled ffmpeg illustration; everything else is the released documents,
highlighted. ElevenLabs narration over a synthesized ambient bed; app-screenshot how-to. 9:16.

    FFMPEG=/path/to/ffmpeg-with-drawtext CLIP_FONT=/path/Bold.ttf python3 showcase/articles/green-fireballs/short.py
"""
import os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", ".."))
from lib import Cut, txt, FFMPEG, TMP

P = lambda f: os.path.join(HERE, f)
OUT = P("short.mp4")
STARS, BALL = os.path.join(TMP, "stars.png"), os.path.join(TMP, "ball.png")
subprocess.run([FFMPEG, "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=black:s=360x360", "-vf",
                "format=gray,geq='if(lt(abs(mod(sin(X*12.9898+Y*78.233)*43758.5453,1)),0.004),120+135*abs(mod(sin(X*3.1+Y*7.7)*9631.3,1)),5)',scale=1080:1080:flags=bicubic,format=rgb24,colorchannelmixer=rr=0.85:bb=1.15",
                "-frames:v", "1", STARS], check=True)
subprocess.run([FFMPEG, "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=black@0:s=120x120,format=rgba", "-vf",
                "geq=r='190':g='255':b='170':a='255*exp(-((X-60)*(X-60)+(Y-60)*(Y-60))/260)'",
                "-frames:v", "1", BALL], check=True)

def top(a, b, b_color="yellow", c=None):
    return [txt(a, 215, 70), txt(b, 300, 62, b_color)] + ([txt(c, 375, 46)] if c else [])

def fireball(lines, secs, say):
    """Illustration: a green fireball crossing a starry sky, nearly flat, with a fading trail."""
    fc = ("[1:v]format=rgba[b];[0:v][b]overlay=x='-120+t*330':y='420+t*18':format=auto,lagfun=decay=0.94,"
          "gblur=sigma=1.2,fps=30,pad=1080:1920:0:450:black,"
          + ",".join([*lines, txt("illustration", 1450, 34, "gray")]) + "[v]")
    c.seg_fc(["-loop", "1", "-i", STARS, "-loop", "1", "-i", BALL], fc, secs, say=say)

def page(img, lines, secs, say):
    """A highlighted typewriter crop, scaled up for phones and panned slowly left to right
    (full-width lines can't be cropped narrower without cutting words)."""
    vf = ["scale=1640:-2", "pad=iw+40:ih+40:20:20:white",
          f"crop=1080:ih:x='(iw-ow)*min(t/{secs},1)':y=0", "fps=30",
          "pad=1080:1920:0:450+(1100-ih)/2:black", *lines]
    c.seg(["-loop", "1", "-i", img], ",".join(vf), secs, say=say)

c = Cut()
fireball(top("Do UFOs watch", "our NUKES?"), 3.5,
         "The theory: UFOs keep showing up where the nukes are.")
page(P("d094-sites.jpg"), top("1949 Air Force report:", "Oak Ridge, Hanford...", c="the A-bomb sites · p.10"), 4,
     "A 1949 Air Force report: sightings near Oak Ridge and Hanford, the atomic bomb plants.")
page(P("d154-ruppelt.jpg"), top("Blue Book chief, 1952:", "\"around Los Alamos\"", c="Ruppelt's talk · p.3"), 3.5,
     "The Air Force's UFO chief: concentrations around Los Alamos.")
fireball(top("1949: green fireballs", "over the A-bomb labs"), 3.5,
         "Then green fireballs streak over the A-bomb labs.")
page(P("d004-room.jpg"), top("A SECRET meeting", "Edward Teller in the room", c="Los Alamos, 16 Feb 1949 · p.2"), 4,
     "So the bomb scientists held a secret meeting. Edward Teller was in the room.")
page(P("d004-roswell.jpg"), top("It even mentions", "ROSWELL", c="5 men watched one go by · p.7"), 4,
     "The transcript even mentions Roswell, home of the world's only atomic bomb unit.")
page(P("d004-copper.jpg"), top("Its green =", "copper in a Bunsen burner", c="\"not a conventional meteor\" · p.9"), 3.5,
     "The meteor expert said: green like copper. No ordinary meteor.")
page(P("d004-teller.jpg"), top("Teller's guess:", "\"an electron phenomenon\"", c="p.25"), 3,
     "Teller's guess: an electron phenomenon.")
page(P("d017-copper.jpg"), top("Plot twist:", "the copper? local dust", c="\"two automobiles\" drove past · p.4"), 4,
     "Plot twist: the copper sample? Probably local dust.")
fireball(top("Skeptics:", "the most watched skies", c="get the most reports"), 3.5,
         "Skeptics say: the most watched skies get the most reports.")
c.seg(["-loop", "1", "-i", P("app-search.png")], ",".join(["crop=860:1080:0:140,scale=1080:1356,fps=30,pad=1080:1920:0:450:black",
      txt("Read the secret transcript:", 215, 62), txt("search \"green fireballs\"", 300, 56, "yellow")]), 3.5,
      say="Read the secret transcript on real U F O dot org.")
page(P("d004-roswell.jpg"), [txt("Watching our nukes,", 215, 66), txt("or watching too hard?", 300, 62, "yellow"), txt("realufo.org", 380, 50)], 3,
     "Watching our nukes, or watching too hard? You decide.")
c.save(OUT, bed=True)
