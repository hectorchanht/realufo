"""Quote crops + photo for men-in-black: the exact words cut from the FBI scans and stacked as short strips
(re-flowed, never retyped). Run from the scratch dir holding 220-dpi renders of FBI file 62-HQ-83894:
  pdftoppm -r 220 -f N -l N -png <Section 5 PDF> M5    (pp.153-155)
  pdftoppm -r 220 -f N -l N -png <Section 9 PDF> M9    (pp.74, 83)
  pdftoppm -r 220 -f N -l N -png <Section 10 PDF> M10  (pp.145, 147)
Word boxes from tesseract tsv; p.153 (faint carbon) by eye and auto-contrasted.

    python3 crops.py <out dir>
"""
from PIL import Image, ImageOps
import sys

OUT = sys.argv[1]
GAP, PAD = 8, 18
C = {  # name: ([(png, x0, x1, y0, y1)], contrast?)
  "sold":      ([("M5-153.png", 722, 1125, 683, 720), ("M5-153.png", 345, 1018, 790, 830),
                 ("M5-153.png", 1020, 1680, 790, 830), ("M5-153.png", 165, 375, 826, 866)], True),   # p.153 for the sum of $1.00. / The "man from Mars" was pictured as / being in the custody of two military / policemen.
  "wiesbaden": ([("M5-153.png", 985, 1585, 1578, 1614), ("M5-153.png", 155, 765, 1612, 1648),
                 ("M5-153.png", 1150, 1555, 1648, 1684), ("M5-153.png", 155, 1035, 1682, 1718)], True), # p.153 the individual shown in custody / of United States Military Police / The location of both / photographs was stated to be Wiesbaden, Germany.
  "kids":      ([("M10-147.png", 700, 1425, 886, 928), ("M10-147.png", 455, 935, 920, 970)], False),  # p.147 the two men were FBI agents who / had captured this man (the kids' names, l.1256, left out: private people)
  "hoover":    ([("M10-145.png", 520, 1122, 1155, 1198), ("M10-145.png", 1118, 1625, 1155, 1198),
                 ("M10-145.png", 285, 965, 1194, 1236)], False),  # p.145 I can assure you the photograph you mentioned does not / represent employees of this Bureau.
  "black-suits": ([("M9-083.png", 290, 960, 1225, 1270), ("M9-083.png", 955, 1450, 1225, 1270),
                   ("M9-083.png", 735, 1555, 1262, 1303)], False),                                    # sec 9 p.83 In 1953 Bender stated he knew / what the saucers are; / "3 men in black suits" silenced Bender
  "no-info":   ([("M9-074.png", 480, 1170, 840, 884), ("M9-074.png", 1168, 1575, 840, 884),
                 ("M9-074.png", 325, 672, 878, 920)], False),     # sec 9 p.74 Bufiles contain no information pertaining to the / "Bender Affair"
  "book":      ([("M9-083.png", 520, 1595, 700, 744), ("M9-083.png", 295, 1000, 742, 782),
                 ("M9-083.png", 1000, 1610, 742, 782), ("M9-083.png", 295, 700, 780, 822)], False),   # sec 9 p.83 The Bureau desires to obtain a copy of the book / written by Gray Barker entitled / "They Knew Too Much About / Flying Saucers."
}
for name, (segs, contrast) in C.items():
    strips = []
    for png, x0, x1, y0, y1 in segs:
        im = Image.open(png).convert("RGB").crop((x0, y0, x1, y1))
        if contrast:
            im = ImageOps.autocontrast(im, cutoff=1)
        im = Image.alpha_composite(im.convert("RGBA"), Image.new("RGBA", im.size, (255, 220, 0, 60))).convert("RGB")
        strips.append(im)
    w = max(s.width for s in strips) + 2 * PAD
    h = sum(s.height for s in strips) + GAP * (len(strips) - 1) + 2 * PAD
    out = Image.new("RGB", (w, h), strips[0].getpixel((2, 2)))
    y = PAD
    for s in strips:
        out.paste(s, (PAD, y)); y += s.height + GAP
    out.save(f"{OUT}/{name}.jpg", quality=92)
    print(name, out.size)
# the photo itself (p.154): right half = "Mister X" between two military policemen; whole clipping with caption
p = Image.open("M5-154.png").convert("RGB")
p.crop((890, 300, 1680, 1150)).save(f"{OUT}/photo-mrx.jpg", quality=92)  # men + "Mister X", arches trimmed
p.save(f"{OUT}/photo-clipping.jpg", quality=90)
print("photo-mrx", (790, 850))
