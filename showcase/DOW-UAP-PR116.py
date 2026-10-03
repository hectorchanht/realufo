"""Showcase Short for DOW-UAP-PR116 (Unresolved UAP Report, Atlantic Ocean, 2020): 32 s of Navy IR
in which the sensor zooms from a speck to a lumpy, lobed cluster. Its Range Fouler Debrief
(DOW-UAP-D091) ticks Round, Square, Balloon-shaped, Other Shape, Metallic, Opaque and Reflective (p.1);
the crew wrote "it appeared as a large, somewhat deformed balloon, but we were unable to verify that
as we passed at the merge" and "it traveled with the wind" (p.2). AARO still lists it Unresolved.
Cut: tease (frame 0 = thumbnail: the speck between the brackets, boxed) -> the whole zoom at 5.9x ->
close-up (plain, then Ironbow) -> the form, boxes lighting up as they're read -> the crew's words ->
lesson (foil balloons are round, metallic, shiny; nobody could verify) -> "zoom in yourself" -> loop.
ElevenLabs narration + ambient bed. 9:16, ~34 s.

    FFMPEG=/path/to/ffmpeg-with-drawtext CLIP_FONT=/path/Bold.ttf python3 showcase/DOW-UAP-PR116.py
(needs pdftoppm for the D091 page)
"""
import os, subprocess, urllib.request
from lib import Cut, txt, tts, IRONBOW, FFMPEG as F, TMP as D, ENC, SILENT as SIL, HERE

U = "https://assets.realufo.org/videos/wargov/DOD_111830151.mp4"
PDF = "https://assets.realufo.org/pdfs/wargov/DOW-UAP-D091_Range-Fouler-Debrief_Atlantic-Ocean_2020.pdf"
OUT = os.path.join(HERE, "DOW-UAP-PR116.mp4")
FIT = "crop=608:1080:656:0,scale=1080:1920"  # 16:9 -> 9:16 around the centred target
TZOOM = "crop=304:540:770:265,scale=1080:1920:flags=lanczos"  # 2x on the speck (~922,535 in frame 0) for the tease
CZOOM = "crop=405:720:68:196,scale=1080:1920:flags=lanczos"  # 1.5x on the cluster at 29.3 s (after FIT's crop)
BOX = "drawbox=x=390:y=810:w=300:h=300:color=yellow@0.95:t=9"
S0, SC = os.path.join(D, "t0.png"), os.path.join(D, "t29.png")
subprocess.run([F, "-v", "error", "-y", "-i", U, "-frames:v", "1", S0], check=True)
subprocess.run([F, "-v", "error", "-y", "-ss", "29.3", "-i", U, "-frames:v", "1", "-vf", "crop=608:1080:656:0", SC], check=True)
pdf = os.path.join(D, "d091.pdf"); urllib.request.urlretrieve(PDF, pdf)
subprocess.run(["pdftoppm", "-r", "300", "-f", "1", "-l", "1", "-png", pdf, os.path.join(D, "p")], check=True)
P1 = next(os.path.join(D, f) for f in os.listdir(D) if f.startswith("p-") and f.endswith(".png"))
site = txt("realufo.org", 1420, 52)
segs = []
def seg(inputs, vf, secs):
    out = os.path.join(D, f"seg{len(segs)}.mp4")
    subprocess.run([F, "-v", "error", "-y", *inputs, *SIL, "-vf", ",".join(vf), "-map", "0:v", "-map", "1:a",
                    "-t", str(secs), *ENC, out], check=True)
    segs.append(out)
still = lambda img, vf, secs: seg(["-loop", "1", "-t", str(secs), "-i", img], vf, secs)

# H: tease (thumbnail): the speck between the sensor's brackets, boxed; the close-up is the payoff
TEASE = [TZOOM, BOX,
         txt("Navy jet, Atlantic, 2020", 250, 66), txt("What's in the brackets?", 335, 76, "yellow"),
         txt("?", 1140, 150, "yellow"), txt("Let's zoom in", 1310, 62), site]
still(S0, TEASE, 2.5)
# A: the sensor's whole zoom, 0 -> 29.3 s at 5.86x
seg(["-t", "29.3", "-i", U], [FIT, "setpts=PTS/5.86", "fps=30", txt("Sensor zooming in", 250, 70), txt("6x speed", 335, 58, "yellow"), site], 5.0)
# B: close-up, plain then the site's Ironbow palette
still(SC, [CZOOM, txt("Up close:", 250, 70), txt("a lumpy, lobed cluster", 335, 70, "yellow"), site], 1.8)
still(SC, [CZOOM, IRONBOW, txt("Same frame", 250, 70), txt("Ironbow palette", 335, 70, "yellow"), site], 1.7)
# C: the debrief form; each ticked box lights up as the narrator reads it (D091 p.1)
def tick(x, y, w, h, t):
    return (f"drawbox=x={x}:y={y + 560}:w={w}:h={h}:color=black:t=13:enable='gte(t,{t})',"
            f"drawbox=x={x + 4}:y={y + 564}:w={w - 8}:h={h - 8}:color=yellow:t=7:enable='gte(t,{t})'")
form = os.path.join(D, "form.png")
subprocess.run([F, "-v", "error", "-y", "-i", P1, "-vf", "crop=791:464:1745:1609,scale=1080:-2", form], check=True)
fc = ("color=c=0x111111:s=1080x1920:d=6.5,fps=30[bg];[0:v]format=rgb24[p];[bg][p]overlay=0:560,"
      + ",".join([tick(223, 101, 317, 89, 1.8), tick(223, 186, 317, 86, 2.3), tick(74, 283, 466, 86, 3.25),
                  tick(745, 190, 317, 86, 4.05), tick(149, 458, 391, 86, 4.8), tick(745, 458, 316, 86, 4.8),
                  tick(700, 544, 361, 86, 4.8),
                  txt("The officer's form:", 250, 70), txt("Navy Range Fouler Debrief", 335, 58, "yellow"),
                  txt("All ticked.", 1250, 90, "yellow").replace("y=1250", "y=1250:enable='gte(t,4.8)'"),
                  txt("DOW-UAP-D091  ·  p.1", 1380, 46)]) + "[v]")
out = os.path.join(D, f"seg{len(segs)}.mp4")
subprocess.run([F, "-v", "error", "-y", "-loop", "1", "-t", "6.5", "-i", form, *SIL, "-filter_complex", fc,
                "-map", "[v]", "-map", "1:a", "-t", "6.5", *ENC, out], check=True)
segs.append(out)
# D: the crew's own words (D091 p.2)
still(SC, [CZOOM, "eq=brightness=-0.35", txt("\"it appeared as a large,", 300, 62, "yellow"),
           txt("somewhat deformed balloon,", 380, 62, "yellow"), txt("but we were unable", 460, 62, "yellow"),
           txt("to verify that\"", 540, 62, "yellow"), txt("DOW-UAP-D091  ·  p.2", 630, 44),
           txt("\"it traveled with the wind\"  ·  p.2", 1300, 50), site], 5.5)
# L: the lesson; the file stays unresolved
still(SC, [CZOOM, "eq=brightness=-0.2", txt("Foil party balloons:", 250, 70), txt("round, metallic, shiny", 335, 70, "yellow"),
           txt("Nobody could verify it", 1210, 58), txt("AARO file: Unresolved", 1300, 58, "yellow"), site], 6.4)
# C2: end card
still(SC, [CZOOM, txt("Zoom in yourself", 250, 80), txt("frame by frame", 345, 80, "yellow"),
           txt("realufo.org/doc/DOW-UAP-PR116", 1380, 50, "yellow"), txt("DOW-UAP-PR116  ·  Atlantic Ocean, 2020", 1460, 42)], 4.0)
# E: loop tail on the tease
still(S0, TEASE, 0.6)

lst = os.path.join(D, "list.txt"); open(lst, "w").write("".join(f"file '{s}'\n" for s in segs))
CAT = os.path.join(D, "cat.mp4")
subprocess.run([F, "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", CAT], check=True)
SAY = [(0.2, "A Navy jet filmed this over the Atlantic. Let us zoom in."),
       (7.7, "Up close: a lumpy, lobed cluster."),
       (11.2, "The officer filled in the form. Round. Square. Balloon-shaped. Metallic. All ticked."),
       (17.7, "In their words: a large, somewhat deformed balloon. But we were unable to verify that."),
       (23.2, "Foil party balloons are round, metallic and shiny. But no one could check, so the file says: unresolved."),
       (29.6, "Zoom in yourself, frame by frame, on real U F O dot org.")]
ins, fc = ["-i", CAT], ""
for i, (t, line) in enumerate(SAY, 1):
    ins += ["-i", tts(line)[0]]; fc += f"[{i}:a]aformat=channel_layouts=stereo,adelay={int(t*1000)}:all=1[n{i}];"
fc += "[0:a]" + "".join(f"[n{i}]" for i in range(1, len(SAY)+1)) + f"amix=inputs={len(SAY)+1}:normalize=0:duration=first[a]"
VO = os.path.join(D, "vo.mp4")
subprocess.run([F, "-v", "error", "-y", *ins, "-filter_complex", fc, "-map", "0:v", "-map", "[a]", "-c:v", "copy",
                "-c:a", "aac", "-b:a", "128k", VO], check=True)
c = Cut(); c.segs = [VO]; c.save(OUT, bed=True)
