"""Quote crops for affa-uranus: the exact words, cut from the scans and stacked as short strips so phones can read
them (re-flowed, never retyped). Run from the scratch dir holding the 220-dpi renders:
  pdftoppm -r 220 -f N -l N -png <FBI 62-HQ-83894 Section 8 PDF> H8   (pp.14-17 -> H8-0NN.png)
  pdftoppm -r 220 -f 26 -l 26 -png <AARO Historical Record Report Vol 1 PDF> Hhrr
Word boxes: tesseract <png> - tsv (FBI scans) / pdftotext -bbox (AARO text layer), x0,x1,y0,y1 in 220-dpi px.

    python3 crops.py <out dir>
"""
from PIL import Image, ImageDraw
import sys

OUT = sys.argv[1]
GAP, PAD = 8, 18
C = {  # name: [(png, x0, x1, y0, y1, highlight?)]
  "hoover-subject": [("H8-017.png", 296, 1215, 666, 750, 0), ("H8-017.png", 296, 910, 776, 852, 1)],      # p.17 From: Hoover / Subject: FLYING SAUCERS; MRS. FRANCES SWAN
  "thought":   [("H8-017.png", 405, 795, 1332, 1375, 1), ("H8-017.png", 810, 1497, 1332, 1375, 1),
                ("H8-017.png", 304, 940, 1369, 1412, 1)],                                                   # p.17 Mrs. Frances Swan who had been receiving messages / through thought transmission.
  "observe":   [("H8-014.png", 1160, 1556, 1302, 1341, 1), ("H8-014.png", 216, 948, 1340, 1378, 1),
                ("H8-014.png", 957, 1518, 1340, 1378, 1)],                                                  # p.14 he observed Mrs. SWAN / writing messages that she was receiving / from someone in "outer space."
  "smith":     [("H8-014.png", 1122, 1649, 1005, 1047, 1), ("H8-014.png", 220, 709, 1045, 1083, 1)],      # p.14 WILBER B. SMITH, a Physicist / of the Canadian Government
  "affa":      [("H8-015.png", 674, 1161, 995, 1035, 1), ("H8-015.png", 1171, 1601, 995, 1035, 1),
                ("H8-015.png", 210, 626, 1033, 1072, 1), ("H8-015.png", 636, 954, 1033, 1072, 1)],          # p.15 "AFFA" is the Manager / or the Commander of the / ship M-4 which is from / the planet Uranus
  "aug1":      [("H8-015.png", 933, 1419, 1803, 1843, 1), ("H8-015.png", 933, 1553, 1881, 1919, 1),
                ("H8-015.png", 214, 957, 1918, 1955, 1)],                                                   # p.15 on Sunday, August 1, 1954, / the ship from "outer space" would / come within 100 miles of Ottawa, Canada,
  "prophecy":  [("H8-016.png", 974, 1517, 479, 521, 1), ("H8-016.png", 217, 778, 518, 559, 1),
                ("H8-016.png", 789, 1495, 518, 559, 1)],                                                    # p.16 "flying saucers" would appear / over many nations of the world / during the latter part of August 1954,
  "nofurther": [("H8-016.png", 1119, 1568, 1364, 1402, 1), ("H8-016.png", 214, 719, 1402, 1439, 1)],      # p.16 and no further action is / being taken by this office.
  "aaro-telepathy": [("Hhrr-26.png", 761, 1461, 1578, 1617, 1), ("Hhrr-26.png", 380, 975, 1616, 1662, 1)],  # AARO HRR p.26 Smith believed he was in personal contact with / extraterrestrial beings through telepathy
}
for name, segs in C.items():
    strips = []
    for png, x0, x1, y0, y1, hl in segs:
        im = Image.open(png).convert("RGBA").crop((x0, y0, x1, y1))
        if hl:
            im = Image.alpha_composite(im, Image.new("RGBA", im.size, (255, 220, 0, 70)))
        strips.append(im.convert("RGB"))
    w = max(s.width for s in strips) + 2 * PAD
    h = sum(s.height for s in strips) + GAP * (len(strips) - 1) + 2 * PAD
    bg = strips[0].getpixel((2, 2))  # the page's own paper colour
    out = Image.new("RGB", (w, h), bg)
    y = PAD
    for s in strips:
        out.paste(s, (PAD, y)); y += s.height + GAP
    out.save(f"{OUT}/{name}.jpg", quality=92)
    print(name, out.size)
