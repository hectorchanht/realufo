"""Showcase Short for DOW-UAP-PR116 (Unresolved UAP Report, Atlantic Ocean, 2020): 32 s of Navy IR
in which the sensor zooms from a speck to a lumpy, lobed cluster. Its Range Fouler Debrief
(DOW-UAP-D091) ticks Round, Square, Balloon-shaped, Other Shape, Metallic, Opaque and Reflective (p.1);
the crew wrote "it appeared as a large, somewhat deformed balloon, but we were unable to verify that
as we passed at the merge" and "it traveled with the wind" (p.2). AARO still lists it Unresolved.
Cut: tease (frame 0 = thumbnail: the speck between the brackets, boxed) -> the whole zoom at 5.9x ->
close-up (plain, then Ironbow) -> the form, boxes lighting up as they're read -> the crew's words ->
lesson (foil balloons are round, metallic, shiny; nobody could verify) -> "zoom in yourself" -> loop.
Enhancement (no invented detail): close-ups are a 9-frame stack (the sensor keeps the target centred)
+ nlmeans denoise + CAS sharpen; the zoom plays through hqdn3d. The crew-quote beat sits on an AI
illustration made to match the file (saved as DOW-UAP-PR116-ai.jpg), labelled "not evidence". ElevenLabs narration + SFX (lib.sfx) + ambient bed. ~34 s.

AI illustration, made to match the file (making-shorts skill, "AI illustrations"):
1. the enhanced IR close-up at 29.3 s, cropped square -> threshold silhouette -> flood-fill the bright-spot
   holes (keeps the notches and the gap between the two masses);
2. tinted dark maroon from the IR shading ("darker, maroonish", D091 p.2), bright IR spots -> silver
   (Metallic/Reflective ticked, p.1), composited on an empty flux-1-schnell dusk-over-Atlantic sky;
3. @cf/black-forest-labs/flux-2-dev, input_image_0 = that mock-up: "Turn image 0 into a photorealistic
   photograph... keep the object's EXACT silhouette, outline, notches, lobes, size, position and dark maroon
   colour; only add realistic material and light: a large, somewhat deformed, partly deflated balloon of thin
   crumpled plastic and foil...; keep the background";
4. relight only (input = step 3): "Keep EVERYTHING identical... change ONLY the lighting... dusk, sun just set at
   the horizon behind the object, backlit... rim light... opaque" (Dusk, Opaque on D091 p.1);
5. exposure only (input = step 4): "...the shadowed side still shows a clearly visible darker maroon colour and
   the creases... metallic foil glints". No seed, so the result is committed.

    FFMPEG=/path/to/ffmpeg-with-drawtext CLIP_FONT=/path/Bold.ttf python3 showcase/DOW-UAP-PR116.py
(needs pdftoppm for the D091 page)
"""
import os, subprocess, urllib.request
from lib import Cut, txt, tts, sfx, IRONBOW, FFMPEG as F, TMP as D, ENC, SILENT as SIL, HERE

U = "https://assets.realufo.org/videos/wargov/DOD_111830151.mp4"
PDF = "https://assets.realufo.org/pdfs/wargov/DOW-UAP-D091_Range-Fouler-Debrief_Atlantic-Ocean_2020.pdf"
OUT = os.path.join(HERE, "DOW-UAP-PR116.mp4")
FIT = "crop=608:1080:656:0,scale=1080:1920"  # 16:9 -> 9:16 around the centred target
TZOOM = "crop=304:540:770:265,scale=1080:1920:flags=lanczos"  # 2x on the speck (~922,535 in frame 0) for the tease
CZOOM = "crop=405:720:68:196,scale=1080:1920:flags=lanczos"  # 1.5x on the cluster at 29.3 s (after FIT's crop)
BOX = "drawbox=x=390:y=810:w=300:h=300:color=yellow@0.95:t=9"
S0, SC = os.path.join(D, "t0.png"), os.path.join(D, "t29.png")
subprocess.run([F, "-v", "error", "-y", "-i", U, "-frames:v", "1", "-vf", "nlmeans=s=4:p=5:r=9", S0], check=True)
# close-up = mean of 9 frames around 29.3 s (target stays centred), then denoise + sharpen
subprocess.run([F, "-v", "error", "-y", "-ss", "29.0", "-t", "0.6", "-i", U, "-vf",
                "crop=608:1080:656:0,tmix=frames=9,select='eq(n\\,8)',nlmeans=s=3:p=5:r=11,cas=0.6",
                "-frames:v", "1", "-fps_mode", "vfr", SC], check=True)
AI = os.path.join(HERE, "DOW-UAP-PR116-ai.jpg")
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
seg(["-t", "29.3", "-i", U], [FIT, "hqdn3d=4:3:6:4", "setpts=PTS/5.86", "fps=30", txt("Sensor zooming in", 250, 70), txt("6x speed", 335, 58, "yellow"), site], 5.0)
# B: close-up, plain then the site's Ironbow palette
still(SC, [CZOOM, txt("Up close:", 250, 70), txt("a lumpy, lobed cluster", 335, 70, "yellow"),
           txt("enhanced: 9-frame stack + denoise", 1300, 44), site], 1.8)
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
still(AI, ["scale=1920:1920,crop=1080:1920:431:0,cas=0.4", txt("\"it appeared as a large,", 215, 54, "yellow"),
           txt("somewhat deformed balloon,", 285, 54, "yellow"), txt("but we were unable", 355, 54, "yellow"),
           txt("to verify that\"  ·  D091 p.2", 425, 54, "yellow"),
           txt("\"it traveled with the wind\"  ·  p.2", 1290, 50),
           txt("AI render of the IR shape + crew's colour, not evidence", 1360, 40), site], 5.5)
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
TICK, WHOOSH = sfx("single crisp pen tick on a paper checkbox, short, clean", 0.6), sfx("fighter jet sensor zoom whoosh, smooth rising air rush", 1.5)
MIX = [(t, tts(line)[0], 1.0) for t, line in SAY] + [(2.5, WHOOSH, 0.5)] + [(t, TICK, 0.8) for t in (12.8, 13.3, 14.25, 15.05)]  # one per box read aloud, no more
ins, fc = ["-i", CAT], ""
for i, (t, path, vol) in enumerate(MIX, 1):
    ins += ["-i", path]; fc += f"[{i}:a]aformat=channel_layouts=stereo,volume={vol},adelay={int(t*1000)}:all=1[n{i}];"
fc += "[0:a]" + "".join(f"[n{i}]" for i in range(1, len(MIX)+1)) + f"amix=inputs={len(MIX)+1}:normalize=0:duration=first[a]"
VO = os.path.join(D, "vo.mp4")
subprocess.run([F, "-v", "error", "-y", *ins, "-filter_complex", fc, "-map", "0:v", "-map", "[a]", "-c:v", "copy",
                "-c:a", "aac", "-b:a", "128k", VO], check=True)
c = Cut(); c.segs = [VO]; c.save(OUT, bed=True)
