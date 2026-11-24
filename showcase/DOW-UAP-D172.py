"""Showcase Short for DOW-UAP-D172 (BAASS Ten-Month Report, July 2009; released in PURSUE
Release 08, 2026-11-20): the DIA/AAWSAP contractor's own program report. Beats, all quoted
from the file itself: p.9 — BAASS designed a 5,000 sq ft underground vault because it was a
"priority to pursue and acquire recovered hardware and biological samples" (a PLAN, stated
as such on screen and in the narration's last line); contents p.5 — the AAWSAP scope;
p.23 — cameras used "at the Utah ranch" (the report never names it; the world knows that
ranch as Skinwalker Ranch — the narration says exactly that, no more); p.272 — the Northern
Tier nuclear-facilities work (bases named in the official summary: Malmstrom, Minot,
Wurtsmith, Loring); p.248 — the Colares database figure (94 military-observed events,
23 physiological events). Page stills: 150 dpi renders of the official PDF, page centred on
a darkened blurred copy of itself; slow zoom per beat. Kokoro narration + ambient bed. 9:16.

    python3 showcase/DOW-UAP-D172.py   (stills pre-rendered in /tmp/d172/fit*.png)
"""
import os
from lib import Cut, txt, stamp

D = "/tmp/d172"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "DOW-UAP-D172.mp4")
site = stamp("DOW-UAP-D172", "BAASS TEN-MONTH REPORT  ·  Jul 2009  ·  DIA / AAWSAP", y=1790)
ZOOM = "zoompan=z='1+0.09*on/899':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=900:s=1080x1920:fps=30"

def beat(png, lines, say, base=3.5, dim=False):
    vf = [ZOOM] + (["eq=brightness=-0.25"] if dim else [])
    y = 64
    for text, fs, color in lines:
        vf.append(txt(text, y, fs, color)); y += int(fs * 1.35)
    vf.append(site)
    cut.seg(["-i", os.path.join(D, png)], ",".join(vf), base, say=say)

cut = Cut()
# H: the vault plan (p.9) — the hook, quoted
beat("fit9.png", [("An underground vault", 76, "white"), ("for “recovered hardware”", 60, "yellow"),
                  ("and “biological samples”", 60, "yellow")],
     "In 2009, the Pentagon's U F O contractor drew up plans for an underground vault, "
     "to store recovered hardware and biological samples.")
# W: whose report this is (contents, p.5)
beat("fit5.png", [("BAASS — Ten-Month Report", 66, "white"), ("the AAWSAP files, opened", 54, "white")],
     "The plan is in this report: the ten-month report of B A A S S, Bigelow Aerospace's study arm, "
     "working for the Defense Intelligence Agency.")
# U: the Utah ranch (p.23) — the report's own words, then the world's name for it
beat("fit23.png", [("“the Utah ranch”", 84, "yellow"), ("the world knows it as", 54, "white"),
                   ("Skinwalker Ranch", 76, "white")],
     "Its investigators ran cameras at a site the report calls only the Utah ranch, "
     "the ranch the world knows as Skinwalker Ranch.")
# N: nuclear bases (Northern Tier, p.272)
beat("fit272.png", [("Sightings near nuclear bases", 62, "white"), ("Malmstrom · Minot", 58, "yellow"),
                    ("Wurtsmith · Loring", 58, "yellow")],
     "They also filed reports on sightings near nuclear bases: Malmstrom, Minot, Wurtsmith, and Loring.")
# C: Colares database (p.248 figure)
beat("fit248.png", [("Colares, Brazil", 76, "white"), ("94 military-observed events", 56, "yellow"),
                    ("23 physiological events", 56, "yellow")],
     "And they built a database on Colares, Brazil: ninety-four military-observed events, "
     "and twenty-three physiological events.")
# E: end card — the honesty line (p.9, dimmed)
beat("fit9.png", [("A plan is not proof.", 80, "yellow"), ("Read the file yourself", 62, "white")],
     "A vault on paper is a plan, not proof anything was ever kept inside. "
     "Read the whole file at real U F O dot org.", dim=True)
cut.save(OUT, bed=True)
