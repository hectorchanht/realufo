"""Short for the "two stars" article: DOW-UAP-PR038 (Middle East, 2013, "eight-pointed star with arms
of alternating length") vs DOW-UAP-PR104 (Yellow Sea, 2025, "six-pointed star"). The tell: PR038's
arms never turn while it crosses the screen (locked to the camera), and the star shrinks as it fades
(spikes grow with brightness) → diffraction spikes drawn by the optics. Black core = hot (black-hot
IR); Invert + Ironbow are the site's filters. Both officially unresolved: "object or optics?".
ElevenLabs narration (lib.tts) over a synthesized ambient bed; app-screenshot how-to beat. 9:16.

    FFMPEG=/path/to/ffmpeg-with-drawtext CLIP_FONT=/path/Bold.ttf python3 showcase/articles/two-stars/short.py
"""
import os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", ".."))
from lib import Cut, txt, SITE, IRONBOW, FFMPEG, TMP

PR104 = "https://assets.realufo.org/videos/wargov/DOD_111830027.mp4"  # 1920x1080, star centred ~(930,460)
PR038 = "https://assets.realufo.org/videos/wargov/DOD_111689051.mp4"  # 1920x1080 (4:3 + bars), star ~(1364,508) at 25.5 s
F26, F50, F74 = (os.path.join(HERE, f"pr038-{t}.jpg") for t in (26, 50, 74))  # 4:3 picture, 1080x810
APP = os.path.join(HERE, "app-search.png")  # 860x1864 mobile screenshot of /archive?q=pointed star&type=video
OUT = os.path.join(HERE, "short.mp4")
HOT = "negate," + IRONBOW
S104, S038 = os.path.join(TMP, "s104.png"), os.path.join(TMP, "s038.png")
subprocess.run([FFMPEG, "-v", "error", "-y", "-ss", "6", "-i", PR104, "-frames:v", "1", S104], check=True)
subprocess.run([FFMPEG, "-v", "error", "-y", "-ss", "25.5", "-i", PR038, "-frames:v", "1", S038], check=True)

def top(a, b, b_color="yellow", c=None):
    return [txt(a, 215, 70), txt(b, 300, 64, b_color)] + ([txt(c, 375, 48)] if c else [])

c = Cut()
SQ104 = "crop=1080:1080:400:0,fps=30,pad=1080:1920:0:450:black"
c.seg(["-ss", "0", "-i", PR104], ",".join([SQ104, *top("2 Pentagon UAP videos", "12 years apart"), SITE()]), 3,
      say="Two Pentagon UFO videos. Both show a black star.")
c.seg(["-loop", "1", "-i", S038], ",".join(["crop=600:600:1054:208,scale=1080:1080",
      "zoompan=z='min(zoom+0.0012,1.12)':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=1080x1080:fps=30",
      "pad=1080:1920:0:450:black", *top("Middle East, 2013", "8 points"), SITE()]), 3,
      say="Middle East, twenty thirteen. Eight points.")
c.seg(["-ss", "4", "-i", PR104], ",".join([SQ104, *top("Yellow Sea, 2025", "6 points"), SITE()]), 3,
      say="Yellow Sea, twenty twenty-five. Six points.")

def still(path, lines, secs, say, tag=None):
    vf = ["scale=1080:810,fps=30,pad=1080:1920:0:520:black", *lines] + ([txt(tag, 1350, 44, "yellow")] if tag else [])
    c.seg(["-loop", "1", "-i", path], ",".join(vf), secs, say=say)

# the tell: three moments, three places on screen, same arm angles
still(F26, top("Watch the arms...", "0:26"), 1.6, None)
still(F50, top("...it crosses the screen", "0:50"), 1.6, None)
still(F74, top("...the arms never turn", "1:14", c="locked to the camera, not the object"), 3.2,
      "It crosses the screen, but the arms never turn. Locked to the camera.")

def split(lines, secs, say, filt=HOT):
    """PR038 over PR104, both filtered, each panel labelled."""
    # Invert turns the redaction boxes white: put pure-black areas of the original back. Erode/dilate keeps
    # only big ones (the boxes), not the saturated star core. gbrp keeps maskedmerge's colours intact.
    er = ",".join(["erosion"] * 5 + ["dilation"] * 6)
    def hot(i, crop, o):
        return (f"[{i}:v]crop={crop},split=2[{o}0][{o}1];[{o}0]{filt},format=gbrp[{o}h];"
                f"[{o}1]format=gray,lut=y='if(lt(val,4),255,0)',{er},format=gbrp[{o}m];"
                f"[{o}h]split[{o}2][{o}3];[{o}3]drawbox=c=black:t=fill[{o}k];[{o}2][{o}k][{o}m]maskedmerge,format=rgb24[{o}]")
    fc = (hot(0, "1080:620:570:198", "a") + ";" + hot(1, "1080:620:400:160", "b") + ";"
          f"[a][b]vstack=2,pad=1080:1920:0:430:black,"
          + ",".join([*lines, txt("2013 · Middle East · 8 points", 445, 44, "yellow"),
                      txt("2025 · Yellow Sea · 6 points", 1075, 44, "yellow")]) + "[v]")
    c.seg_fc(["-loop", "1", "-i", S038, "-loop", "1", "-i", S104], fc, secs, say=say)

split(top("Diffraction spikes", "the camera draws the star", c="Hubble: 4 spikes · Webb: 8"), 4.5,
      "It's diffraction: the camera's struts draw the spikes. Hubble draws four. Webb, eight.")
fc = (f"[0:v]scale=720:540[a];[1:v]scale=720:540[b];[a][b]vstack=2,pad=1080:1920:180:470:black,"
      + ",".join([*top("As it fades...", "...the star shrinks", c="spikes grow with brightness"),
                  txt("0:26", 480, 40, "yellow"), txt("1:14", 1020, 40, "yellow")]) + "[v]")
c.seg_fc(["-loop", "1", "-i", F26, "-loop", "1", "-i", F74], fc, 3.5, say="And as it fades, the star shrinks. Spikes grow with brightness.")
split(top("Black core = HOT", "black-hot infrared", c="invert it and it glows"), 4,
      "Black core? In black-hot infrared, black means hot.")
c.seg(["-loop", "1", "-i", APP], ",".join(["crop=860:1080:0:140,scale=1080:1356,fps=30,pad=1080:1920:0:450:black",
      txt("Check it yourself:", 215, 70), txt("search \"pointed star\" on realufo.org", 300, 52, "yellow")]), 4,
      say="Search pointed star on real U F O dot org, and step it frame by frame.")
c.seg(["-loop", "1", "-i", S104], ",".join(["crop=1080:1080:400:0,fps=30,pad=1080:1920:0:470:black",
      txt("Object or optics?", 215, 74), txt("realufo.org", 300, 70, "yellow"), txt("do the spikes ever turn?", 380, 46)]), 3,
      say="Object, or optics? You decide.")
c.save(OUT, bed=True)
