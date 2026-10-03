"""Showcase Short for SPAIN-BVD-38287-Manises-791111-1979, the Spanish Air Force file on the Manises
incident (11 Nov 1979; Biblioteca Virtual de Defensa record 38287, CC BY 4.0). No footage: highlighted
crops of the file's own pages. Documents vs lore, every line from a cited page:
  p.2   JK 297 (Palma-Tenerife) sees "dos luces rojas intensas" at 22:05Z and diverts to Valencia;
        "La tripulación no vio en ningún momento objeto alguno".
  p.3   a fighter from Albacete: "No hubo contacto radar con objeto alguno ni por parte del avión
        ni por parte de Pegaso".
  p.108 the investigating officer: witnesses saw "el recorrido normal de un astro, probablemente un
        planeta"; on clear nights any distant light flickers "debido a la masa de aire interpuesta"
        (the lesson: why the light flashed white, red and green).
  p.147 the 1980 answer to parliament: it "no fué ningún tipo de avión, ignorándose la naturaleza del
        objeto en cuestión, que bien pudo ser simplemente una ilusión óptica" (kept as the file's own
        hedge: nature unknown, not "solved").
Not used: the fighter's warning system did log "algunos blocajes" on 11 Nov (p.3), so "the famous
lock-on was another night" would mislead in a 3 s beat.
ElevenLabs narration over the ambient bed, calm subtitles, record watermark per beat. 9:16.

    FFMPEG=/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg CLIP_FONT=~/Library/Fonts/DejaVuSans-Bold.ttf \
      python3 showcase/SPAIN-BVD-38287-Manises-791111-1979.py
"""
import os, subprocess, urllib.request
from PIL import Image
from lib import Cut, txt, tts, subtitles, TMP, HERE

ID = "SPAIN-BVD-38287-Manises-791111-1979"
OUT = os.path.join(HERE, f"{ID}.mp4")
PDF = os.path.join(TMP, "manises.pdf")
urllib.request.urlretrieve(f"https://assets.realufo.org/pdfs/spain/BVD-38287-Manises-791111-1979.pdf", PDF)

def page(n):
    out = os.path.join(TMP, f"pg{n}")
    subprocess.run(["pdftoppm", "-f", str(n), "-l", str(n), "-r", "200", "-png", "-singlefile", PDF, out], check=True)
    return Image.open(out + ".png").convert("RGB")  # 1655 x 2340 at 200 dpi

def strip(n, box, marks, name):
    """Crop `box` (x0,y0,x1,y1 at 200 dpi) from page n; yellow marker (multiply) over each mark rect."""
    im = page(n)
    for x0, y0, x1, y1 in marks:
        r = im.crop((x0, y0, x1, y1))
        im.paste(Image.composite(Image.new("RGB", r.size, (255, 214, 0)), r, r.convert("L").point(lambda v: 150 if v > 128 else 0)), (x0, y0))
    p = os.path.join(TMP, name + ".png")
    im.crop(box).save(p)
    return p

LIGHTS = strip(2, (110, 1440, 1600, 1545), [(1003, 1492, 1470, 1528)], "lights")
NEVER = strip(2, (110, 1595, 1600, 1712), [(635, 1634, 1592, 1670), (185, 1670, 335, 1706)], "never")
RADAR = strip(3, (90, 400, 1580, 530), [(1000, 448, 1565, 485), (195, 486, 1245, 522)], "radar")
PLANET = strip(108, (90, 640, 1580, 750), [(475, 655, 1530, 692), (95, 705, 230, 742)], "planet")
AIR = strip(108, (90, 1250, 1610, 1350), [(1275, 1260, 1605, 1297), (95, 1307, 1605, 1347)], "air")
VERDICT = strip(147, (380, 1350, 1520, 1490), [(745, 1383, 1230, 1416), (410, 1418, 1410, 1451), (410, 1451, 965, 1486)], "verdict")

SUB_Y = 1250
def top(a, b, c=None):
    return [txt(a, 215, 66), txt(b, 300, 58, "yellow")] + ([txt(c, 375, 42)] if c else [])
def mark(p):
    return txt(f"realufo.org  ·  {ID}  ·  p.{p}", 1420, 34, "gray")
def subs(say):
    return subtitles([(0, tts(say)[0])], y=SUB_Y, fs=44)
def doc(img, lines, p, secs, say, pan=(0, 0), caption=True, extra=()):
    """The highlighted strip zoomed 1.75x (scan text readable on a phone) in the document band (y 620-1120),
    panned along the line in reading order: pan=(start, end) as fractions of the overflow, over the beat."""
    s0, s1 = pan
    vf = ["scale=iw*1.75:-2", "pad=iw+20:ih+20:10:10:white",
          f"crop='min(1060,iw)':ih:x='(iw-ow)*({s0}+({s1}-{s0})*min(t/{secs},1))':y=0", "fps=30",
          "pad=1080:1920:(ow-iw)/2:620+(500-ih)/2:black", *lines, *extra, mark(p)] + (subs(say) if caption else [])
    c.seg(["-loop", "1", "-i", img], ",".join(vf), secs, say=say)

c = Cut()
TEASE = top("Spain, 1979: a jet diverts", "What did the crew see?")
Q = [txt("?", 1150, 140, "yellow")]
# frame 0: the question, the marked lights line in view, no subtitles
doc(LIGHTS, TEASE + Q, 2, 3, "Spain, nineteen seventy-nine. A jet diverts. What did the crew see?", pan=(1, 1), caption=False)
doc(LIGHTS, top("Flight JK 297, 22:05Z:", "\"two intense red lights\"", "at their level, near Ibiza · p.2"), 2, 2.5,
    "Two intense red lights, at their level.", pan=(0.3, 1))
doc(NEVER, top("The Air Force file:", "the crew \"never saw", "any object\" · p.2"), 2, 3,
    "The Air Force file: the crew never saw an object.", pan=(1, 0))
doc(RADAR, top("A fighter scrambles:", "no radar contact", "not the jet, not the ground · p.3"), 3, 3,
    "A fighter scrambles. No radar contact, from the jet or the ground.", pan=(1, 0))
doc(PLANET, top("The bright light over Valencia?", "\"probably a planet\"", "the investigating officer · p.108"), 108, 3,
    "The bright light over the port? Probably a planet.", pan=(0.6, 0))
doc(AIR, top("Why it flashed red and green:", "a distant light twinkles", "through thick air · p.108"), 108, 3,
    "Why red and green? Distant lights twinkle through thick air.", pan=(1, 0))
doc(VERDICT, top("The verdict, 1980:", "Not an aircraft.", "Nature unknown · p.147"), 147, 4,
    "The verdict: not any kind of aircraft. Nature unknown. Maybe an optical illusion.", pan=(0, 0.7),
    extra=[txt("\"Maybe an optical illusion\"", 1150, 56, "yellow")])
doc(VERDICT, [txt("Read all 150 pages:", 215, 66), txt(f"realufo.org/doc/{ID}", 300, 40, "yellow"),
              txt("zoom into every page", 375, 42)], 147, 3,
    "Read all hundred and fifty pages on real U F O dot org.", pan=(0.35, 0.35), caption=False)
# loop: back on the frame-0 image
doc(LIGHTS, TEASE + Q, 2, 1, None, pan=(1, 1), caption=False)
c.save(OUT, bed=True)
