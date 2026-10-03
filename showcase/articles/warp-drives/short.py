"""Short for the "warp drives" article: AAWSAP, the DIA's 2008-2010 programme ($21,948,810 to Bigelow
Aerospace Advanced Space Studies, Las Vegas) and its 37 papers (warp drives, wormholes, antigravity,
cloaking, injuries). All visuals are the released PDFs, highlighted (PyMuPDF): the contract's box 26,
the objectives ("through the year 2050", "spatial/temporal translation"), the warp paper's Table 1
(Mars in 193 s at 100c) and Star Trek line, the injury paper's case counts. Twist: the papers were
public for years; the receipts (contract file) are new. Ends on in-PDF search ("Orion Nebula").
ElevenLabs narration over a synthesized ambient bed. 9:16.

    FFMPEG=/path/to/ffmpeg-with-drawtext CLIP_FONT=/path/Bold.ttf python3 showcase/articles/warp-drives/short.py
"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", ".."))
from lib import Cut, txt

P = lambda f: os.path.join(HERE, f)
OUT = P("short.mp4")

def top(a, b, b_color="yellow", c=None):
    return [txt(a, 215, 70), txt(b, 300, 62, b_color)] + ([txt(c, 375, 46)] if c else [])

def page(img, lines, secs, say, h=1100):
    """A tight, highlighted PDF crop on a white card with a slow push-in, text band on top."""
    vf = ["scale=w=1000:h=1020:force_original_aspect_ratio=decrease", "pad=iw+40:ih+40:20:20:white",
          f"pad=1080:{h}:(ow-iw)/2:(oh-ih)/2:black",
          f"zoompan=z='min(zoom+0.0008,1.06)':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=1080x{h}:fps=30",
          f"pad=1080:1920:0:450:black", *lines]
    c.seg(["-loop", "1", "-i", img], ",".join(vf), secs, say=say)

c = Cut()
page(P("s-title-D138.jpg"), top("The Pentagon paid", "for WARP DRIVES"), 3.5,
     "The Pentagon paid twenty-two million dollars for warp drive research. Here are the receipts.")
page(P("s-receipt.jpg"), top("$21,948,810", "to a Las Vegas company"), 3.5,
     "In 2008, the D I A hired Bigelow Aerospace, in Las Vegas.")
page(P("s-list.jpg"), top("The to-do list:", "\"spatial/temporal translation\"", c="threats \"through the year 2050\""), 4,
     "The brief: threats to the year twenty fifty. Item five: spatial, temporal translation.")
for f, t in (("s-title-D139.jpg", "wormholes & stargates"), ("s-title-D135.jpg", "antigravity"), ("s-title-D122.jpg", "invisibility cloaks")):
    page(P(f), top("37 papers, incl.", t), 1.3, None)
page(P("s-table.jpg"), top("At 100x light speed:", "Mars in 193 seconds", c="Alpha Centauri: 15 days"), 4,
     "The warp paper did the math: Mars in a hundred and ninety-three seconds.")
page(P("s-startrek.jpg"), top("It cites Star Trek", "by name", c="energy needed: \"phenomenally high\""), 3.5,
     "It cites Star Trek, and admits the energy needed is phenomenally high.")
page(P("s-cases.jpg"), top("The dark one: injuries", "42 + 300 cases", c="mostly known microwave exposures"), 4,
     "The dark one is about injuries. Most cases: known microwave exposures.")
page(P("s-receipt.jpg"), top("The twist:", "the papers leaked years ago", c="what's new: the receipts"), 3.5,
     "Twist: the papers leaked years ago. The receipts are new.")
c.seg(["-loop", "1", "-i", P("app-search.png")], ",".join(["crop=860:1080:0:140,scale=1080:1356,fps=30,pad=1080:1920:0:450:black",
      txt("Search inside the PDFs:", 215, 66), txt("\"Orion Nebula\" on realufo.org", 300, 56, "yellow")]), 3.5,
      say="Search inside every document on real U F O dot org.")
page(P("s-table.jpg"), [txt("Visionary or sci-fi?", 215, 72), txt("realufo.org", 300, 70, "yellow"), txt("read all 37 papers, free", 380, 46)], 3,
     "Visionary, or sci-fi on the taxpayer? You decide.")
c.save(OUT, bed=True)
