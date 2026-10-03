"""Short for the "into the sea" article: Puerto Rico 2013 (AARO-DOD_110692805…, solved: two sky
lanterns over land, lost against the sea's temperature) vs DOW-UAP-PR067 (2022, "Multiple Spherical
UAP USO near Sub … in and out of water", unresolved; AARO's notes never mention water). Neither
shows a splash: one blinks out, one fades. Bonus: the HUD's "3FT" is where the line of sight meets
the surface. ElevenLabs narration over a synthesized ambient bed; app-screenshot how-to. 9:16.

    FFMPEG=/path/to/ffmpeg-with-drawtext CLIP_FONT=/path/Bold.ttf python3 showcase/articles/into-the-sea/short.py
"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", ".."))
IMG = os.path.join(HERE, "..", "images")  # stills; app-*.png + short.mp4 live here in short/
from lib import Cut, txt, SITE

PR = "https://assets.realufo.org/videos/aaro/DOD_110692805-1920x1080-9000k.mp4"  # 1920x1080 (4:3 + bars); object at crosshair ~(936,531) 2:04-2:05.5
PR067 = "https://assets.realufo.org/videos/wargov/DOD_111720696.mp4"  # 1280x720; speck enters ~(922,648) at 0:49, fades by 0:55
CLOSE = os.path.join(IMG, "AARO-DOD_110692805-1920x1080-9000k.jpg")
BRIGHT, FADED = os.path.join(IMG, "pr067-0524.jpg"), os.path.join(IMG, "pr067-0552.jpg")
APP = os.path.join(HERE, "app-search.png")  # /archive?q=USO&type=video
OUT = os.path.join(HERE, "short.mp4")

def top(a, b, b_color="yellow", c=None):
    return [txt(a, 215, 70), txt(b, 300, 64, b_color)] + ([txt(c, 375, 48)] if c else [])

c = Cut()
PRSQ = "crop=720:720:576:171,scale=1080:1080,fps=30,pad=1080:1920:0:450:black"
c.seg(["-ss", "118", "-i", PR], ",".join([PRSQ, *top("Puerto Rico, 2013", "a UFO dives into the sea?"), SITE()]), 3.5,
      say="Puerto Rico, twenty thirteen. A UFO races over an airport, and dives into the ocean?")
c.seg(["-ss", "123.5", "-i", PR], ",".join([PRSQ, *top("Watch it...", "...gone. No splash."), SITE()]), 3.2,
      say="Watch. It's there... and gone. No splash.")
c.seg(["-loop", "1", "-i", CLOSE], ",".join(["scale=1080:1080,fps=30,pad=1080:1920:0:470:black",
      *top("AARO rebuilt it in 3D", "8 mph, with the wind, over LAND", c="best fit: two sky lanterns")]), 4,
      say="The Pentagon rebuilt it in 3D: two lanterns, drifting with the wind, over land.")
c.seg(["-loop", "1", "-i", CLOSE], ",".join(["scale=1080:1080,fps=30,pad=1080:1920:0:470:black",
      *top("Thermal cameras can't", "see into water", c="heat matched the sea → it vanished")]), 4,
      say="Thermal cameras can't see into water. Their heat matched the sea, so they vanished.")
c.seg(["-ss", "124", "-i", PR], ",".join(["crop=1440:1080:240:0,scale=1080:810,fps=30,drawbox=x=550:y=722:w=150:h=58:c=yellow:t=4",
      "pad=1080:1920:0:520:black", *top("\"3 FT\" isn't its height", "it's where the camera's", "yellow", "line of sight hits the sea")]), 4,
      say="That three feet on screen? It's where the camera's line of sight hits the sea.")
c.seg(["-ss", "48", "-i", PR067], ",".join(["crop=420:420:700:300,scale=1080:1080,fps=30,pad=1080:1920:0:450:black",
      *top("2022, near a submarine", "\"in and out of water\"?"), SITE()]), 4,
      say="Now twenty twenty-two, near a submarine: spherical UFOs, in and out of water?")
fc = (f"[0:v]scale=540:540[a];[1:v]scale=540:540[b];[a][b]hstack,pad=1080:1920:0:620:black,"
      + ",".join([*top("No splash. No wake.", "it just fades", c="and AARO's notes never say \"water\"")]) + "[v]")
c.seg_fc(["-loop", "1", "-i", BRIGHT, "-loop", "1", "-i", FADED], fc, 4,
         say="No splash, no wake. It just fades. And the Pentagon's notes never mention water.")
c.seg(["-loop", "1", "-i", APP], ",".join(["crop=860:1080:0:140,scale=1080:1356,fps=30,pad=1080:1920:0:450:black",
      txt("Check it yourself:", 215, 70), txt("search \"USO\" on realufo.org", 300, 56, "yellow")]), 3.5,
      say="Check it yourself. Search U S O on real U F O dot org.")
c.seg(["-loop", "1", "-i", os.path.join(IMG, "DOW-UAP-PR067.jpg")], ",".join(["scale=1080:1080,fps=30,pad=1080:1920:0:470:black",
      txt("Diving UFO or fading heat?", 215, 66), txt("realufo.org", 300, 70, "yellow"), txt("step it frame by frame, free", 380, 46)]), 3,
      say="Diving UFO, or fading heat? You decide.")
c.save(OUT, bed=True)
