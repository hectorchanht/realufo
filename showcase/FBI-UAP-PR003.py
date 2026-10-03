"""Showcase Short for FBI-UAP-PR003 ("Orbs Over the Pond", 2024). The witness told the FBI the light
resembled a "plasma-like sphere" changing shape; at 2:47 (167.5 s) the sharp dot swells into a soft disc
and is sharp again by 2:49, the way any point light looks when a camera loses focus ("bokeh").
Posed as a question: the FBI file has no conclusion, and two FBI agents saw lights there too
(FBI-UAP-D007 p.2). Cut: tease (frame 0 = thumbnail: the sharp dot boxed, no spoiler) -> 165-170.5 s,
swell at ~5 s -> 4x slower -> dot / sphere / dot -> lesson -> agents' quote -> end card -> loop.
ElevenLabs narration + calm subtitles (lib.subtitles) + ambient bed. 9:16, ~34 s.

    FFMPEG=/path/to/ffmpeg-with-drawtext CLIP_FONT=/path/Bold.ttf python3 showcase/FBI-UAP-PR003.py
"""
import os, subprocess
from lib import Cut, txt, tts, subtitles, FFMPEG as F, FONT, TMP as D, ENC, SILENT as SIL, HERE

U = "https://assets.realufo.org/videos/wargov/DOD_111764159.mp4"
OUT = os.path.join(HERE, "FBI-UAP-PR003.mp4")
CROP = "crop=606:1080:656:0"  # stored black-bar crop (assets.crop)
ZOOM = CROP + ",crop=303:540:289:330,scale=1080:1920:flags=lanczos"  # 2x on the light (~440,600 in the crop)
BOX = "drawbox=x=390:y=810:w=300:h=300:color=yellow@0.95:t=9"
STILL = {t: os.path.join(D, f"s{t}.png") for t in (165.0, 167.5, 169.0)}
for t, p in STILL.items():
    subprocess.run([F, "-v", "error", "-y", "-ss", str(t), "-i", U, "-frames:v", "1", "-vf", CROP, p], check=True)
site = txt("realufo.org", 1420, 52)
segs = []
def run(args, secs):
    i = args.index("-vf"); args, vf = args[:i], args[i:i + 2]  # -vf belongs after every input
    out = os.path.join(D, f"seg{len(segs)}.mp4")
    subprocess.run([F, "-v", "error", "-y", *args, *SIL, *vf, "-map", "0:v", "-map", "1:a", "-t", str(secs), *ENC, out], check=True)
    segs.append(out)
def still(t, vf, secs):
    run(["-loop", "1", "-t", str(secs), "-i", STILL[t], "-vf", ",".join(vf)], secs)
ZS = ZOOM.replace(CROP + ",", "")  # the stills are already cropped

# H: tease on frame 0 (thumbnail): the sharp dot boxed; the swell is the payoff, so it isn't shown
TEASE = [ZS, BOX, txt("A witness told the FBI:", 250, 66), txt("\"plasma-like sphere\"", 335, 80, "yellow"),
         txt("?", 1140, 150, "yellow"), txt("Watch it change shape", 1310, 62), site]
still(165.0, TEASE, 2.5)
# A: normal speed, box on; the swell lands ~5 s in
run(["-ss", "165.0", "-i", U, "-vf", ",".join([ZOOM, "fps=30", BOX, txt("Watch the light", 290, 84), site])], 5.5)
# A2: the swell 4x slower (1.8 s -> 7.2 s)
run(["-ss", "166.6", "-t", "1.8", "-i", U, "-vf", ",".join([ZOOM, "setpts=4*PTS", "fps=30", BOX,
     txt("Did you see it?", 290, 84), txt("4x slower", 380, 66, "yellow"), site])], 7.2)
# B: dot / sphere / dot, stacked panels around the light
P = "crop=606:213:0:493,scale=1080:380"
fc = (f"[0:v]{P},drawtext=fontfile={FONT}:text='DOT  2\\:45':fontcolor=yellow:fontsize=44:borderw=3:x=24:y=16[a];"
      f"[1:v]{P},drawtext=fontfile={FONT}:text='SPHERE  2\\:47':fontcolor=yellow:fontsize=44:borderw=3:x=24:y=16[b];"
      f"[2:v]{P},drawtext=fontfile={FONT}:text='DOT  2\\:49':fontcolor=yellow:fontsize=44:borderw=3:x=24:y=16[c];"
      "color=c=black:s=1080x1920:d=3.5[bg];[bg][a]overlay=0:290[t1];[t1][b]overlay=0:680[t2];[t2][c]overlay=0:1070,"
      + txt("Same light, 4 seconds", 200, 66) + "[v]")
out = os.path.join(D, f"seg{len(segs)}.mp4")
subprocess.run([F, "-v", "error", "-y", *[a for t in STILL.values() for a in ("-loop", "1", "-t", "3.5", "-i", t)], *SIL,
                "-filter_complex", fc, "-map", "[v]", "-map", "3:a", "-t", "3.5", *ENC, out], check=True)
segs.append(out)
# L: the lesson + sound bite, on the swollen disc
still(167.5, [ZS, txt("Out of focus,", 250, 80), txt("every light is an orb", 345, 80, "yellow"),
              txt("photographers call it \"bokeh\"", 1300, 58), site], 5.3)
# K: balance: the FBI's own agents (FBI-UAP-D007 p.2); the file has no conclusion
still(169.0, [ZS, "eq=brightness=-0.15", txt("But 2 FBI agents, Nov 2024:", 230, 62),
              txt("\"white lights appear at", 320, 66, "yellow"), txt("the top of the tree line\"", 400, 66, "yellow"),
              txt("FBI-UAP-D007  ·  p.2", 490, 46), txt("No conclusion in the file", 1300, 58), site], 4.8)
# C: end card
still(167.5, [ZS, txt("Step through all 4 minutes", 250, 70), txt("frame by frame", 340, 80),
              txt("realufo.org/doc/FBI-UAP-PR003", 1380, 50, "yellow"),
              txt("FBI-UAP-PR003  ·  Orbs Over the Pond", 1460, 42)], 4.4)
# E: loop tail, back on the frame-0 tease
still(165.0, TEASE, 0.6)

lst = os.path.join(D, "list.txt"); open(lst, "w").write("".join(f"file '{s}'\n" for s in segs))
CAT = os.path.join(D, "cat.mp4")
subprocess.run([F, "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", CAT], check=True)
# narration at fixed cues (s); quiet from 4.4 s so the swell at ~5 s plays clean
SAY = [(0.2, "A witness told the FBI it looked like a plasma-like sphere. Watch it."),
       (8.2, "Did you see it? Four times slower."),
       (15.4, "Dot. Sphere. Dot again. Same light."),
       (18.9, "Here is the thing. Out of focus, every light is an orb. Photographers call it bokeh."),
       (24.2, "But two FBI agents went there, and saw lights too. The file stays open."),
       (29.0, "Watch all four minutes, frame by frame, on real U F O dot org.")]
ins, fc = ["-i", CAT], ""
for i, (t, line) in enumerate(SAY, 1):
    ins += ["-i", tts(line)[0]]; fc += f"[{i}:a]aformat=channel_layouts=stereo,adelay={int(t*1000)}:all=1[n{i}];"
fc += "[0:a]" + "".join(f"[n{i}]" for i in range(1, len(SAY)+1)) + f"amix=inputs={len(SAY)+1}:normalize=0:duration=first[a]"
VO = os.path.join(D, "vo.mp4")
# subtitles, one line per sentence, under the headline (y 470); the dot/sphere/dot line is skipped (it's the panel labels),
# the agents' line sits low (y 1170) because their quote fills the top of that beat
CAP = (subtitles([(t, tts(line)[0]) for t, line in SAY if not line.startswith(("Dot.", "But two"))], y=470)
       + subtitles([(t, tts(line)[0]) for t, line in SAY if line.startswith("But two")], y=1170))
subprocess.run([F, "-v", "error", "-y", *ins, "-filter_complex", fc + ";[0:v]" + ",".join(CAP) + "[v]", "-map", "[v]", "-map", "[a]",
                "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "20",
                "-c:a", "aac", "-b:a", "128k", VO], check=True)
c = Cut(); c.segs = [VO]; c.save(OUT, bed=True)
