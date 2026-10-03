"""Short for the "gunship" article: AC-130 over the Gulf of Oman, 8 Sep 2021 (DOW-UAP-D101 + PR117-PR122).
Two "cold orbs" hover over a flare; the officer fires the 105mm; per the report they fly off before the
recoil; "like dolphins in a pod"; the recorder "inexplicably failed", so the clips are a phone filming
the cockpit screen. PR121 0:14.1-0:14.3: two orbs cross the screen in ~0.3 s (step frame by frame).
Science: "cold" = colder than the warm sea behind; targeting-tool speeds have GoFast's parallax trap.
ElevenLabs narration over a synthesized ambient bed; app-screenshot how-to. 9:16.

    FFMPEG=/path/to/ffmpeg-with-drawtext CLIP_FONT=/path/Bold.ttf python3 showcase/articles/gunship/short.py
"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", ".."))
IMG = os.path.join(HERE, "..", "images")  # stills; app-*.png + short.mp4 live here in short/
from lib import Cut, txt, SITE

V = "https://assets.realufo.org/videos/wargov/DOD_{}.mp4"
PR117, PR118, PR121 = V.format(111887401), V.format(111887407), V.format(111887439)  # all 1920x1080 phone captures
ORB, PAIR, ORB2 = (os.path.join(IMG, f) for f in ("DOW-UAP-PR118.jpg", "DOW-UAP-PR121.jpg", "pr121-orb.jpg"))
APP = os.path.join(HERE, "app-search.png")  # /archive?q=gunship&type=video
OUT = os.path.join(HERE, "short.mp4")

def top(a, b, b_color="yellow", c=None):
    return [txt(a, 215, 70), txt(b, 300, 62, b_color)] + ([txt(c, 375, 48)] if c else [])

def still(img, lines, secs, say):
    c.seg(["-loop", "1", "-i", img], ",".join(["scale=1080:1080,fps=30,pad=1080:1920:0:470:black", *lines]), secs, say=say)

c = Cut()
c.seg(["-ss", "0", "-i", PR121], ",".join(["crop=1000:1000:600:40,scale=1080:1080,fps=30,pad=1080:1920:0:450:black",
      *top("A US gunship fired", "its cannon at 2 UFOs"), SITE()]), 3.5,
      say="In twenty twenty-one, a U.S. gunship fired its cannon at two UFOs.")
c.seg(["-ss", "0", "-i", PR118], ",".join(["crop=900:900:380:150,scale=1080:1080,fps=30,pad=1080:1920:0:450:black",
      *top("Gulf of Oman, 2021", "two \"cold orbs\" over a flare"), SITE()]), 3.5,
      say="Gulf of Oman. Two cold orbs hover over a flare in the sea.")
still(ORB2, top("The officer fires...", "they leave before the recoil"), 3.5,
      "The officer fires. In the split second before the recoil, they fly away.")
# the pair crosses the screen in ~0.3 s: real speed, then 8x slower
c.seg(["-ss", "13.6", "-i", PR121], ",".join(["crop=1000:1000:700:0,scale=1080:1080,fps=30,pad=1080:1920:0:450:black",
      *top("\"like dolphins in a pod\"", "blink and you miss them"), SITE()]), 1.6,
      say="The report says they swam like dolphins in a pod.")
c.seg(["-ss", "13.95", "-i", PR121], ",".join(["crop=1000:1000:700:0,setpts=8*PTS,scale=1080:1080,fps=30,pad=1080:1920:0:450:black",
      *top("8x slower:", "two orbs, side by side", c="\"They knew they were flying together\"")]), 3.6,
      say="They knew they were flying together.")
c.seg(["-ss", "2", "-i", PR117], ",".join(["scale=1080:-2,fps=30,pad=1080:1920:0:560:black",
      *top("Then the recorder", "\"inexplicably failed\"", c="so someone filmed the screen")]), 4,
      say="Then the plane's recorder inexplicably failed. So someone filmed the screen with a phone.")
still(ORB, top("\"Cold\" = colder than", "the warm sea behind it", c="shiny things reflect the cold sky"), 4,
      "Cold just means colder than the warm sea. Anything shiny, reflecting the night sky, reads cold.")
c.seg(["-loop", "1", "-i", APP], ",".join(["crop=860:1080:0:140,scale=1080:1356,fps=30,pad=1080:1920:0:450:black",
      txt("See all 6 clips:", 215, 70), txt("search \"gunship\" on realufo.org", 300, 56, "yellow")]), 3.5,
      say="Search gunship on real U F O dot org, and step it frame by frame.")
still(PAIR, [txt("Cannon vs cold orbs", 215, 72), txt("realufo.org", 300, 70, "yellow"), txt("still officially unresolved", 380, 46)], 3,
      "Still unresolved. What do you think they were?")
c.save(OUT, bed=True)
