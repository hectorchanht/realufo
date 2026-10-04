"""Showcase Short: the "Hellfire orb" (30 Oct 2024, MQ-9 off Yemen), shown by Rep. Eric Burlison at the
House Oversight UAP hearing, 9 Sep 2025. The clip is NOT an archive record (leaked, never officially
released); the record is the hearing transcript CONGRESS-CHRG-119hhrg61718:
  p.32 Burlison: "an MQ-9 drone tracking an orb ... off the coast of Yemen ... another MQ-9 launched a
       hellfire missile"; Knapp: "a hellfire missile smacking into that UFO and just bounced right off,
       and it kept going."
  p.46 Luna: "anything in the U.S. Government arsenal that can split a Hellfire missile like this?" ->
       "Nothing." (Nuccetelli), "Nothing to my knowledge" (Wiggins).
Lesson: the camera rides a moving drone. AARO "Go Fast" card p.3: "The object's apparent high speed is
attributable to motion parallax." Metabunk 3D analysis (Mick West, Zaine M., Sep 2025, outside source,
labelled): "very consistent with a near-static small object in light wind that descends relatively
slowly after being hit". Kept as debated, not solved.

Source: https://x.com/RepEricBurlison/status/1965438792493355291 (640x328, 30 fps, 1506 frames), fetched
with yt-dlp into showcase/.src/hellfire-burlison.mp4 (git-ignored). Frames: orb in the crosshair (320,182);
missile enters top left f577 (~167,99), reaches the orb f594-595; a piece exits right f597-609; orb + 2-3
bits drift down-left after; sensor black/white f785-794, then the zoomed-out sea view.
Cut: tease (f560, orb boxed) -> real speed (impact ~4.7 s) -> 3x slower -> frame by frame f588-599 ->
"Hit. Split. Kept going." + Knapp p.32 -> Luna p.46 -> parallax lesson (AARO Go Fast p.3) -> 3D model
(Metabunk) -> end card -> loop. ~33.5 s.

    FFMPEG=/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg CLIP_FONT=$HOME/Library/Fonts/DejaVuSans-Bold.ttf \
        python3 showcase/CONGRESS-CHRG-119hhrg61718.py
"""
import os, subprocess
from lib import Cut, txt, tts, sfx, stamp, subtitles, FFMPEG as F, FONT, TMP as D, ENC, SILENT as SIL, HERE

ID = "CONGRESS-CHRG-119hhrg61718"
SRC = os.path.join(HERE, ".src", "hellfire-burlison.mp4")
OUT = os.path.join(HERE, f"{ID}.mp4")
# source (x,y) -> screen: crop 400x288 at (120,20), x2.7 -> 1080x778 at y=470
VIEW = "crop=400:288:120:20,scale=1080:778:flags=lanczos,pad=1080:1920:0:470:black"
ZOOM = "crop=240:173:190:100,scale=1080:778:flags=lanczos,pad=1080:1920:0:470:black"  # 4.5x on the impact
BOX = "drawbox=x=460:y=827:w=160:h=160:color=yellow@0.95:t=8"       # the orb at f560
MBOX = "drawbox=x=100:y=650:w=280:h=200:color=yellow@0.95:t=6"      # where the missile comes in (f577-592)
site = stamp(ID, "HELLFIRE ORB  ·  Oct 30, 2024  ·  off Yemen  ·  MQ-9 drones")
CREDIT = txt("Video: Rep. Eric Burlison  ·  House UAP hearing, Sep 9 2025", 1334, 28)
segs = []

def run(inp, vf, secs):
    out = os.path.join(D, f"seg{len(segs)}.mp4")
    subprocess.run([F, "-v", "error", "-y", *inp, *SIL, "-vf", ",".join(vf), "-map", "0:v", "-map", "1:a",
                    "-t", str(secs), *ENC, out], check=True)
    segs.append(out)

def clip(f0, f1, slow, frame, vf, secs):
    """Source frames f0..f1 (exact, by frame number), `slow`x slower, through `frame` (VIEW/ZOOM)."""
    run(["-i", SRC], [f"trim=start_frame={f0}:end_frame={f1},setpts=(PTS-STARTPTS)*{slow},fps=30", frame, *vf], secs)

STILL = {}
def still(f, frame, vf, secs):
    if f not in STILL:
        STILL[f] = os.path.join(D, f"f{f}.png")
        subprocess.run([F, "-v", "error", "-y", "-i", SRC, "-vf", f"select=eq(n\\,{f})", "-frames:v", "1", STILL[f]], check=True)
    run(["-loop", "1", "-t", str(secs), "-i", STILL[f]], [frame, *vf], secs)

# H: tease = frame 0 = thumbnail: orb boxed in the crosshair, no missile yet
TEASE = [BOX, txt("A Hellfire missile", 215, 78), txt("is about to hit this", 300, 78, "yellow"),
         txt("?", 1000, 140, "yellow"), CREDIT, site]
still(560, VIEW, TEASE, 2.5)
# A: real speed, impact ~4.7 s in (f595)
clip(530, 650, 1, VIEW, [BOX, txt("Watch the box", 215, 84), txt("real speed", 1258, 50, "yellow"), CREDIT, site], 3.8)
# A2: 3x slower, missile's entry boxed while it crosses
clip(576, 610, 3, VIEW, [MBOX + ":enable='lt(t,1.7)'", txt("3x slower", 215, 84), txt("missile", 1258, 50, "yellow"),
                          CREDIT, site], 3.2)
# B: frame by frame, zoomed on the impact (f588-599, 0.25 s each)
cnt = os.path.join(D, "count.txt"); open(cnt, "w").write("FRAME %{eif:588+floor(t/0.25):d} / 1506")
run(["-i", SRC], ["trim=start_frame=588:end_frame=600,setpts=N*0.25/TB,fps=30", ZOOM, txt("Frame by frame", 215, 84),
                  f"drawtext=fontfile={FONT}:textfile={cnt}:fontcolor=yellow:fontsize=56:borderw=4:bordercolor=black:"
                  "x=(w-text_w)/2:y=1256", CREDIT, site], 3.0)
# C: aftermath, the sound bite + Knapp (p.32)
clip(596, 737, 1, VIEW, [txt("Hit. Split. Kept going.", 215, 84, "yellow"),
                         txt("\"bounced right off\"  ·  hearing p.32", 300, 50), CREDIT, site], 4.7)
# D: Luna's question + the witnesses (p.46), the pieces drifting 2.25x slower
clip(640, 700, 2.25, VIEW, [txt("\"anything ... that can split", 215, 62), txt("a Hellfire missile like this?\"", 295, 62),
                            txt("Rep. Luna  ·  hearing p.46", 380, 42),
                            txt("Witnesses: \"Nothing.\"", 1250, 62, "yellow") + ":enable='gte(t,3.0)'", CREDIT, site], 4.5)
# L1: the lesson, on the zoomed-out view (camera on a moving drone)
clip(840, 981, 1, VIEW, [txt("A moving camera can fake speed", 215, 66, "yellow"),
                         txt("AARO, \"Go Fast\": \"apparent high speed is", 296, 36),
                         txt("attributable to motion parallax\"  ·  p.3", 340, 36), CREDIT, site], 4.7)
# L2: the 3D model (outside source, labelled), on the zoomed orb + bits
still(650, ZOOM, ["eq=brightness=-0.08", txt("One 3D model of this clip:", 215, 64),
                  txt("small object, drifting in wind", 300, 66, "yellow"),
                  txt("Metabunk (Mick West, Zaine M.), Sep 2025  ·  not official", 1256, 30),
                  txt("Still debated", 1294, 40), site], 3.2)
# E: end card
still(560, VIEW, ["eq=brightness=-0.25", txt("Read what they said", 230, 74), txt("hearing transcript p.32 + p.46", 320, 60, "yellow"),
                  txt(f"realufo.org/doc/{ID}", 1380, 50, "yellow"), txt("House UAP hearing  ·  Sep 9 2025", 1460, 40)], 3.5)
# loop tail: back on the tease
still(560, VIEW, TEASE, 0.5)

lst = os.path.join(D, "list.txt"); open(lst, "w").write("".join(f"file '{s}'\n" for s in segs))
CAT = os.path.join(D, "cat.mp4")
subprocess.run([F, "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", CAT], check=True)
# narration cues (s); quiet 3.7-6.4 so the impact (~4.7 s) plays clean
SAY = [(0.2, "A drone fires a Hellfire missile at this orb. Watch the box."),
       (6.4, "Again, slower. The missile drops in, top left."),
       (9.6, "Frame by frame. Impact. A piece flies on."),
       (12.5, "Hit. Split. Kept going. A journalist told Congress it bounced right off."),
       (17.2, "Anything in our arsenal that can split a Hellfire like this? Witnesses: nothing."),
       (21.7, "The catch: the camera rides a moving drone. That alone can make slow things look fast."),
       (26.4, "One 3D model fits a small object, drifting in the wind."),
       (29.6, "Read the hearing, page thirty two, on real U F O dot org.")]
FX = [(4.55, sfx("distant muffled explosion thud, short", 1.5), 0.6)]  # the one effect: the impact
ins, fc = ["-i", CAT], ""
for i, (t, line) in enumerate(SAY, 1):
    ins += ["-i", tts(line)[0]]; fc += f"[{i}:a]aformat=channel_layouts=stereo,adelay={int(t*1000)}:all=1[n{i}];"
for j, (t, p, vol) in enumerate(FX, len(SAY) + 1):
    ins += ["-i", p]; fc += f"[{j}:a]aformat=channel_layouts=stereo,volume={vol},adelay={int(t*1000)}:all=1[n{j}];"
n = len(SAY) + len(FX)
fc += "[0:a]" + "".join(f"[n{i}]" for i in range(1, n + 1)) + f"amix=inputs={n + 1}:normalize=0:duration=first[a]"
MIXED = os.path.join(D, "mix.wav")
subprocess.run([F, "-v", "error", "-y", *ins, "-filter_complex", fc, "-map", "[a]", MIXED], check=True)
# subtitles under the headline (y 392); Luna's beat (quote on screen) and the end card are skipped
CAP = subtitles([(t, tts(line)[0]) for t, line in SAY if not line.startswith(("Anything", "Read the"))], y=392)
VO = os.path.join(D, "vo.mp4")
subprocess.run([F, "-v", "error", "-y", "-i", CAT, "-i", MIXED, "-vf", ",".join(CAP), "-map", "0:v", "-map", "1:a",
                "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "20",
                "-c:a", "aac", "-b:a", "128k", VO], check=True)
c = Cut(); c.segs = [VO]; c.save(OUT, bed=True)
