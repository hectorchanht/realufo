"""Showcase Short for DOW-UAP-PR159 (Tremonton, Utah, 2 July 1952): Navy CPO Delbert Newhouse's 16mm film of
~10 white dots. Its Blue Book file (DOW-UAP-D102, full text from the 2026 re-OCR) holds three verdicts:
the Naval Photographic Interpretation Center, Dec 1952: "It appears to be a light source rather than reflected
light" (p.130); the Air Force, 1956: "little reasonable doubt that the UFOs in the Newhouse film were indeed
seagulls" (p.127); a 1956 photogrammetric analysis that even weighed "ballooning spiders" (p.87): "no definite
conclusion could be obtained" (p.88). Lesson: the Navy's own speed formula (p.131: mean 653.5 mph at five miles,
"x/5 times 653.5" at x miles) gives 33 mph at a quarter mile; the Blue Book card (DOW-UAP-D103 p.2): "No
reference points by which to estimate speed, distance or size". Cut: tease (frame 0: the cluster boxed) ->
18.0-22.0 s -> 3x slower -> Navy / Air Force / 1956 verdicts -> lesson + sound bite -> end card -> loop.
ElevenLabs narration + calm subtitles + ambient bed. 9:16, ~35 s. Footage brightened (curves) + denoised.

    FFMPEG=/path/to/ffmpeg-with-drawtext CLIP_FONT=/path/Bold.ttf python3 showcase/DOW-UAP-PR159.py
"""
import os, subprocess
from lib import Cut, txt, stamp, tts, subtitles, FFMPEG as F, TMP as D, ENC, SILENT as SIL, HERE

U = "https://assets.realufo.org/videos/wargov/DOD_111985807.mp4"
OUT = os.path.join(HERE, "DOW-UAP-PR159.mp4")
LOOK = "curves=all='0/0 0.25/0.6 1/1'"  # the dots are 3-5 px on a dark 1952 print: lift the sky so they read
CROP = "crop=608:1080:640:0"  # 9:16 slice of the 4:3 scan where the formation crosses (x 720-1130)
FIT = f"{CROP},{LOOK},scale=1080:1920:flags=lanczos"
ZOOM = f"crop=304:540:760:540,{LOOK},hqdn3d=3:3:4:4,scale=1080:1920:flags=lanczos"  # 2x on the 20.5 s cluster
BOX = "drawbox=x=500:y=860:w=230:h=230:color=yellow@0.95:t=8"  # the 19.0 s cluster (~990,545 in the scan)
STILL = {t: os.path.join(D, f"s{t}.png") for t in (19.0, 20.5)}
for t, p in STILL.items():
    subprocess.run([F, "-v", "error", "-y", "-ss", str(t), "-i", U, "-frames:v", "1", p], check=True)
# watermark: story keyword · when · where · who over "realufo.org · ID" (search "Tremonton" lands here)
site = stamp("DOW-UAP-PR159", "TREMONTON FILM  ·  Jul 2, 1952  ·  Utah  ·  Navy photographer")
segs, at = [], [0.0]  # at[0]: running start time of the next beat
def run(args, secs):
    i = args.index("-vf"); args, vf = args[:i], args[i:i + 2]  # -vf belongs after every input
    out = os.path.join(D, f"seg{len(segs)}.mp4")
    subprocess.run([F, "-v", "error", "-y", *args, *SIL, *vf, "-map", "0:v", "-map", "1:a", "-t", str(secs), *ENC, out], check=True)
    segs.append(out); at[0] += secs
def still(t, vf, secs):
    run(["-loop", "1", "-t", str(secs), "-i", STILL[t], "-vf", ",".join(vf)], secs)
SAY = []
def say(line, base):
    """Cue a narration line 0.2 s into the next beat; the beat lasts at least as long as the line."""
    SAY.append((at[0] + 0.2, line))
    return max(base, tts(line)[1] + 0.6)

# H: tease on frame 0 (thumbnail): the cluster boxed, the verdicts not given away
TEASE = [FIT, BOX, txt("A Navy officer filmed", 250, 72), txt("these over Utah, 1952", 335, 72),
         txt("?", 1110, 150, "yellow"), txt("Navy and Air Force disagreed", 1290, 54), site]
SAY.append((0.2, "A Navy officer filmed these in 1952. What are they?"))
still(19.0, TEASE, 2.5)
# A: the formation moving, normal speed
run(["-ss", "18.0", "-i", U, "-vf", ",".join([FIT, "hqdn3d=3:3:4:4", "fps=30", txt("Watch the dots", 290, 84), site])], 4.0)
# A2: 3x slower (1.6 s -> 4.8 s)
SAY.append((at[0] + 0.3, "Three times slower. Ten of them, moving together."))
run(["-ss", "18.75", "-t", "1.6", "-i", U, "-vf", ",".join([FIT, "hqdn3d=3:3:4:4", "setpts=3*PTS", "fps=30",
     txt("3x slower", 290, 84, "yellow"), txt("16mm Kodachrome, hand-held", 385, 52), site])], 4.8)
# V1-V3: the three verdicts, quoted from the Blue Book file, on the dimmed zoom
def verdict(who, q1, q2, cite, line, base=3.8):
    secs = say(line, base)
    still(20.5, [ZOOM, "eq=brightness=-0.18", txt(who, 230, 60), txt(q1, 320, 66, "yellow"), txt(q2, 400, 66, "yellow"),
                 txt(cite, 490, 44), site], secs)
verdict("Navy photo lab, Dec 1952:", "\"a light source rather", "than reflected light\"", "DOW-UAP-D102  ·  p.130",
        "Navy lab: a light source, not reflected light.")
verdict("Air Force, 1956:", "\"little reasonable doubt\"", "\"indeed seagulls\"", "DOW-UAP-D102  ·  p.127",
        "The Air Force said: seagulls. Little reasonable doubt.")
verdict("Another analysis, 1956:", "even \"ballooning spiders\"", "\"no definite conclusion\"", "DOW-UAP-D102  ·  p.87-88",
        "Another analyst even considered ballooning spiders. No conclusion.")
# L: the lesson: the Navy's own formula, distance unknown -> speed unknown; sound bite
secs = say("The catch: at five miles, six hundred fifty miles an hour. "
           "At a quarter mile, thirty-three. No distance, no answer.", 5.5)
still(20.5, [ZOOM, txt("Navy's own math, same dots:", 230, 58), txt("5 miles away: 653 mph", 320, 70),
             txt("1/4 mile away: 33 mph", 405, 70, "yellow"), txt("DOW-UAP-D102  ·  p.131", 495, 44),
             txt("No distance, no answer.", 1260, 76, "yellow"), site], secs)
# C: end card
secs = say("Step through it frame by frame on real U F O dot org.", 4.0)
still(20.5, [ZOOM, txt("Step through the 1952 film", 250, 70), txt("frame by frame", 340, 80),
             txt("realufo.org/doc/DOW-UAP-PR159", 1380, 50, "yellow"),
             txt("DOW-UAP-PR159  ·  Tremonton, Utah", 1460, 42)], secs)
# E: loop tail, back on the frame-0 tease
still(19.0, TEASE, 0.6)

lst = os.path.join(D, "list.txt"); open(lst, "w").write("".join(f"file '{s}'\n" for s in segs))
CAT = os.path.join(D, "cat.mp4")
subprocess.run([F, "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", CAT], check=True)
ins, fc = ["-i", CAT], ""
for i, (t, line) in enumerate(SAY, 1):
    ins += ["-i", tts(line)[0]]; fc += f"[{i}:a]aformat=channel_layouts=stereo,adelay={int(t*1000)}:all=1[n{i}];"
fc += "[0:a]" + "".join(f"[n{i}]" for i in range(1, len(SAY)+1)) + f"amix=inputs={len(SAY)+1}:normalize=0:duration=first[a]"
# subtitles: line 1 is the tease text (frame 0 stays caption-free); the verdict/lesson beats fill the top,
# so their lines sit low (y 1170; the lesson's at 1150, above the sound bite)
lines = [(t, tts(l)[0]) for t, l in SAY]
CAP = (subtitles([lines[1], lines[-1]], y=470) + subtitles(lines[2:5], y=1170) + subtitles([lines[5]], y=1150))
# two steps: mix the narration on its own, then burn the subtitles (one graph dropped PR116's late lines)
MIXED = os.path.join(D, "mix.wav"); VO = os.path.join(D, "vo.mp4")
subprocess.run([F, "-v", "error", "-y", *ins, "-filter_complex", fc, "-map", "[a]", MIXED], check=True)
subprocess.run([F, "-v", "error", "-y", "-i", CAT, "-i", MIXED, "-vf", ",".join(CAP), "-map", "0:v", "-map", "1:a",
                "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "20",
                "-c:a", "aac", "-b:a", "128k", VO], check=True)
c = Cut(); c.segs = [VO]; c.save(OUT, bed=True)
