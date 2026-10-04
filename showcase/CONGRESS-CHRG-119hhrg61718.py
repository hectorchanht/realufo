"""Showcase Short: the "Hellfire orb" (30 Oct 2024, MQ-9 off Yemen), shown by Rep. Eric Burlison at the
House Oversight UAP hearing, 9 Sep 2025. The clip is NOT an archive record (leaked, never officially
released); the record is the hearing transcript CONGRESS-CHRG-119hhrg61718:
  p.32 Burlison: "an MQ-9 drone tracking an orb ... off the coast of Yemen ... another MQ-9 launched a
       hellfire missile"; Knapp: "a hellfire missile smacking into that UFO and just bounced right off,
       and it kept going."
  p.46 Luna: "anything in the U.S. Government arsenal that can split a Hellfire missile like this?" ->
       "Nothing." (Nuccetelli), "Nothing to my knowledge" (Wiggins).
The open question (user's "nothing survives a Hellfire"): did it even explode? Our frame check: around the
orb (crop 200x140 at 220,110) mean brightness stays flat (~195-197) over f594-596 and the count of
near-white pixels DROPS (204 -> 70) - no flash at contact. Hellfire targets per Lockheed's AGM-114R card:
"armor, air defense, patrol boats ... buildings, open areas, SUVs or caves" (all surface). Elizondo (CBS,
Sep 2025): a hit "on something solid" leaves "not much left"; Pentagon told CBS "no comment".
Lesson: the camera rides a moving drone. AARO "Go Fast" card p.3: "The object's apparent high speed is
attributable to motion parallax." Look-alike in the archive: AARO-DOD_111038535 "Middle East Red Balloon
2024" (same kind of drone IR over whitecaps, lobed bright blob, 36-40 s): AARO "almost certainly (>=95%
likelihood) a consumer-grade reflective foil balloon". Kept as a question, not solved. (Metabunk 3D model,
Mick West/Zaine M.: "near-static small object in light wind" - research only, not on screen.)

Source: https://x.com/RepEricBurlison/status/1965438792493355291 (640x328, 30 fps, 1506 frames), fetched
with yt-dlp into showcase/.src/hellfire-burlison.mp4 (git-ignored). Frames: orb in the crosshair (320,182);
missile enters top left f577 (~167,99), reaches the orb f594-595; a piece exits right f597-609; orb + 2-3
bits drift down-left after; sensor black/white f785-794, then the zoomed-out sea view.
Look (user, 2026-10-04): nothing drawn over the object (a borderless 2.7x lens inset, like the site's zoom
lens, and zoom cuts wide -> mid -> tight); the site's dark tokens (ink #e7ecf4, amber #ffb648); every shot over
a blurred, darkened copy of itself (whole 9:16 used); real realufo.org captures (mobile, quotes marked amber
text + 10% tint + underline): Full Text p.46 / p.32, AARO-DOD_111038535's page with ?t=38&pal=ironbow and the
real footage composited into its player with a ticking time/frame counter.
Cut: tease (mid zoom f560, "?") -> real speed + lens (impact ~4.7 s) -> 4x slower in Ironbow, frame counter ->
tight freeze f596 "No flash at contact. Did it even explode?" -> "Hit. Split. Kept going." + Knapp p.32 ->
Full Text p.46 "Nothing." -> parallax lesson (AARO Go Fast p.3) -> AARO look-alike on its doc page (player,
then verdict) + Pentagon "no comment" -> end card on Full Text p.32 -> loop. ~35.8 s.

    FFMPEG=/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg CLIP_FONT=$HOME/Library/Fonts/DejaVuSans-Bold.ttf \
        python3 showcase/CONGRESS-CHRG-119hhrg61718.py
"""
import os, subprocess
from lib import Cut, txt, tts, sfx, stamp, subtitles, IRONBOW, FFMPEG as F, FONT, TMP as D, ENC, SILENT as SIL, HERE

ID = "CONGRESS-CHRG-119hhrg61718"
SRC = os.path.join(HERE, ".src", "hellfire-burlison.mp4")
BALLOON = "https://assets.realufo.org/videos/aaro/DOD_111038535.mp4"  # AARO-DOD_111038535
OUT = os.path.join(HERE, f"{ID}.mp4")
INK, AMB = "0xe7ecf4", "0xffb648"  # the site's dark tokens (--ink, --amber): natural, easy on the eyes
MONO = os.path.expanduser("~/Library/Fonts/DejaVuSansMono.ttf")
CAP_DIR = os.path.join(HERE, ".src")  # realufo.org captures (in-app browser, mobile 375x812 @2x = 750x1624)
BLUR = "boxblur=28:2,eq=brightness=-0.32:saturation=0.75"

def T(text, y, fs, color=INK):
    return txt(text, y, fs, color)

def frame(crop, pre=""):
    """The shot over a blurred, darkened full-screen copy of itself (the whole 9:16 is used, no black bars);
    `crop` of the 640x328 source scaled to 1080 wide at y 470."""
    return (f"{pre}split[fg][bk];[bk]scale=-2:1920,crop=1080:1920,{BLUR}[bg];"
            f"[fg]{crop},scale=1080:-2:flags=lanczos[v0];[bg][v0]overlay=0:470")

VIEW = frame("crop=400:288:120:20")     # wide: x2.7, orb at screen (540,907)
MID = frame("crop=320:230:140:60")      # x3.4: orb (607,882), missile entry (91,602)
TIGHT = frame("crop=240:173:200:100")   # x4.5 on the contact
site = stamp(ID, "HELLFIRE ORB  ·  Oct 30, 2024  ·  off Yemen  ·  MQ-9 drones")
CREDIT = T("Video: Rep. Eric Burlison  ·  House UAP hearing, Sep 9 2025", 1334, 28)
segs = []

# lens: circular mask + thin ring, 400 px, top right of the wide view (away from the action)
MASK, RING = os.path.join(D, "mask.png"), os.path.join(D, "ring.png")
subprocess.run([F, "-v", "error", "-y", "-f", "lavfi", "-i", "color=black:s=400x400", "-vf",
                "format=gray,geq=lum='if(lt(hypot(X-199.5\\,Y-199.5)\\,198)\\,255\\,0)'", "-frames:v", "1", MASK], check=True)
subprocess.run([F, "-v", "error", "-y", "-f", "lavfi", "-i", "color=white:s=400x400", "-vf",
                "format=rgba,geq=r=231:g=236:b=244:a='if(between(hypot(X-199.5\\,Y-199.5)\\,196\\,199)\\,170\\,0)'",
                "-frames:v", "1", RING], check=True)

def run(inp, vf, secs):
    # format=yuv420p last: a JPEG/PNG input's full range would otherwise ride along `concat -c copy` (blacks -> grey)
    out = os.path.join(D, f"seg{len(segs)}.mp4")
    subprocess.run([F, "-v", "error", "-y", *inp, *SIL, "-vf", ",".join([*vf, "format=yuv420p"]), "-map", "0:v", "-map", "1:a",
                    "-t", str(secs), *ENC, out], check=True)
    segs.append(out)

def clip(f0, f1, slow, frm, vf, secs):
    """Source frames f0..f1 (exact, by frame number), `slow`x slower, through `frm` (VIEW/MID/TIGHT)."""
    run(["-i", SRC], [f"trim=start_frame={f0}:end_frame={f1},setpts=(PTS-STARTPTS)*{slow},fps=30", frm, *vf], secs)

STILL = {}
def still(f, frm, vf, secs):
    if f not in STILL:
        STILL[f] = os.path.join(D, f"f{f}.png")
        subprocess.run([F, "-v", "error", "-y", "-i", SRC, "-vf", f"select=eq(n\\,{f})", "-frames:v", "1", STILL[f]], check=True)
    run(["-loop", "1", "-t", str(secs), "-i", STILL[f]], [frm, *vf], secs)

def lens_clip(f0, f1, vf, secs):
    """Wide view + a borderless 2.7x lens on the contact area (source 150x150 at 245,107); nothing drawn on the object."""
    out = os.path.join(D, f"seg{len(segs)}.mp4")
    fc = (f"[0:v]trim=start_frame={f0}:end_frame={f1},setpts=PTS-STARTPTS,fps=30,split[a][b];"
          f"[a]{VIEW},{','.join(vf)}[base];"
          "[b]crop=150:150:245:107,scale=400:400:flags=lanczos,format=rgba[lz];[1:v]format=gray[m];[lz][m]alphamerge[lm];"
          f"[base][lm]overlay=650:480[o];[o][2:v]overlay=650:480,"
          f"drawtext=fontfile={FONT}:text='LENS 2.7x':fontcolor={AMB}:fontsize=30:borderw=3:bordercolor=black:x=850-text_w/2:y=888,"
          "format=yuv420p[v]")
    subprocess.run([F, "-v", "error", "-y", "-i", SRC, "-loop", "1", "-i", MASK, "-loop", "1", "-i", RING, *SIL,
                    "-filter_complex", fc, "-map", "[v]", "-map", "3:a", "-t", str(secs), *ENC, out], check=True)
    segs.append(out)

def site_card(img, y0, vf, secs, stamped=True, x0=40, w=670):
    """A realufo.org page capture cropped to the marked lines (w x 535 = 12 text lines at x0,y0; y0 on a line top), scaled to
    1005 wide at y 440, over a blurred copy of the page."""
    card = (f"split[fg][bk];[bk]scale=1080:-2,crop=1080:1920,{BLUR}[bg];"
            f"[fg]crop={w}:535:{x0}:{y0},scale=1005:{round(535 * 1005 / w / 2) * 2}:flags=lanczos[v0];[bg][v0]overlay=37:440,"
            f"drawbox=x=35:y=438:w=1009:h={round(535 * 1005 / w / 2) * 2 + 4}:color=0x2a3040:t=2")
    run(["-loop", "1", "-t", str(secs), "-i", os.path.join(CAP_DIR, img)], [card, *vf, *([site] if stamped else [])], secs)

def balloon_player(vf, secs):
    """The site's doc page for AARO-DOD_111038535 (?t=38&pal=ironbow), with the real footage running in its player
    (Ironbow, as the page draws it) and its time / frame counter (F = t*30) ticking along."""
    out = os.path.join(D, f"seg{len(segs)}.mp4")
    clock = os.path.join(D, "clock.txt"); open(clock, "w").write("00:%{eif:38+floor(t):d:2}.%{eif:mod(floor(t*100),100):d:2} / 01:36.20")
    fr = os.path.join(D, "fr.txt"); open(fr, "w").write("F%{eif:1140+floor(t*30):d}")
    dt = f"drawtext=fontfile={MONO}:fontsize=21:fontcolor=0xb8bcc4"
    fc = (f"[0:v]split[u][bk];[bk]scale=1080:-2,crop=1080:1920,{BLUR}[bg];"
          f"[1:v]fps=30,{IRONBOW},scale=682:384:flags=lanczos[vid];[u]crop=750:735:0:0[ui];[ui][vid]overlay=34:151,"
          f"drawbox=x=112:y=620:w=236:h=34:color=0x0c0d11:t=fill,{dt}:textfile={clock}:x=116:y=626,"
          f"drawbox=x=438:y=620:w=76:h=34:color=0x0c0d11:t=fill,{dt}:textfile={fr}:x=445:y=626,"
          "scale=900:882:flags=lanczos[card];[bg][card]overlay=90:440,drawbox=x=88:y=438:w=904:h=886:color=0x2a3040:t=2,"
          + ",".join([*vf, site, "format=yuv420p"]) + "[v]")
    subprocess.run([F, "-v", "error", "-y", "-loop", "1", "-i", os.path.join(CAP_DIR, "balloon-site-player.jpg"),
                    "-ss", "38", "-i", BALLOON, *SIL, "-filter_complex", fc, "-map", "[v]", "-map", "2:a",
                    "-t", str(secs), *ENC, out], check=True)
    segs.append(out)

# H: tease = frame 0 = thumbnail: mid zoom, orb in the crosshair, "?" under it (nothing drawn over it)
TEASE = [T("A Hellfire missile", 215, 78), T("is about to hit this", 300, 78, AMB), T("?", 965, 140, AMB), CREDIT, site]
still(560, MID, TEASE, 2.5)
# A: real speed, wide + lens; impact ~4.7 s in (f595)
lens_clip(530, 644, [T("Watch the crosshair", 215, 80), T("real speed", 1258, 50, AMB), CREDIT, site], 3.8)
# B: zoom in (mid), 4x slower, the site's Ironbow palette, frame counter
cnt = os.path.join(D, "count.txt"); open(cnt, "w").write("FRAME %{eif:576+floor(t*7.5):d} / 1506")
clip(576, 601, 4, frame("crop=320:230:140:60", pre=IRONBOW + ","),
     [T("4x slower", 215, 84), T("Ironbow palette, as on realufo.org", 300, 44, AMB),
      f"drawtext=fontfile={FONT}:textfile={cnt}:fontcolor={AMB}:fontsize=56:borderw=4:bordercolor=black:x=(w-text_w)/2:y=1256",
      CREDIT, site], 3.2)
# X: zoom in more (tight), freeze on contact: the open question
still(596, TIGHT, [T("No flash at contact", 215, 80), T("Did it even explode?", 300, 80, AMB),
                   T("frame 596: no brightness spike around the orb", 1256, 32), CREDIT, site], 3.5)
# C: zoom out, aftermath: the sound bite + Knapp (p.32)
clip(596, 737, 1, VIEW, [T("Hit. Split. Kept going.", 215, 84, AMB),
                         T("\"bounced right off\"  ·  hearing p.32", 300, 50), CREDIT, site], 4.7)
# D: the witnesses' answers on realufo.org's Full Text view, page 46 (quotes marked)
site_card("hellfire-site-p46.jpg", 656, [T("Rep. Luna asked the witnesses", 215, 62), T("\"Nothing.\"", 300, 76, AMB),
          T("Full text  ·  page 46  ·  realufo.org", 1290, 30)], 4.5)
# L1: the lesson, on the zoomed-out view (camera on a moving drone)
clip(840, 981, 1, VIEW, [T("A moving camera can fake speed", 215, 66, AMB),
                         T("AARO, \"Go Fast\": \"apparent high speed is", 296, 36),
                         T("attributable to motion parallax\"  ·  p.3", 340, 36), CREDIT, site], 4.7)
# R1: the same tools on AARO's own look-alike: the site's player, Ironbow palette, frame counter running
balloon_player([T("Same tools, AARO's 2024 orb:", 215, 60), T("Middle East, Ironbow palette", 300, 50, AMB)], 2.6)
# R2: AARO's verdict on that page + the Pentagon on this clip
site_card("balloon-site-verdict.jpg", 528, [T("AARO's verdict on it:", 215, 62), T("\"reflective foil balloon\"", 300, 70, AMB),
          T("This Hellfire clip: Pentagon \"no comment\" (CBS)", 1290, 32)], 2.1, x0=18, w=714)
# E: end card on the transcript page (Burlison's description marked)
site_card("hellfire-site-p32a.jpg", 612, [T("Read what they said", 215, 74), T("hearing transcript p.32 + p.46", 300, 56, AMB),
          T(f"realufo.org/doc/{ID}", 1380, 50, AMB), T("House UAP hearing  ·  Sep 9 2025", 1460, 40)], 3.6, stamped=False)
# loop tail: back on the tease
still(560, MID, TEASE, 0.5)

lst = os.path.join(D, "list.txt"); open(lst, "w").write("".join(f"file '{s}'\n" for s in segs))
CAT = os.path.join(D, "cat.mp4")
subprocess.run([F, "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", CAT], check=True)
# narration cues (s); quiet 3.7-6.3 so the contact (~4.7 s) plays clean
SAY = [(0.2, "A drone fires a Hellfire missile at this orb. Watch the crosshair."),
       (6.4, "Slow it down. The missile drops in, top left."),
       (9.6, "Look closely. No flash at contact. Did it even explode?"),
       (13.1, "Hit. Split. Kept going. A journalist told Congress it bounced right off."),
       (17.8, "Anything in our arsenal that can split a Hellfire like this? Witnesses: nothing."),
       (22.3, "The catch: the camera rides a moving drone. That alone can make slow things look fast."),
       (27.0, "In 2024, the Pentagon's U F O office called a look-alike orb a foil balloon."),
       (31.6, "Read the hearing, page thirty two, on real U F O dot org.")]
FX = [(4.35, sfx("fast missile whoosh flyby, short, no explosion", 1.2), 0.3)]  # the one effect: the pass
ins, fc = ["-i", CAT], ""
for i, (t, line) in enumerate(SAY, 1):
    ins += ["-i", tts(line)[0]]; fc += f"[{i}:a]aformat=channel_layouts=stereo,adelay={int(t*1000)}:all=1[n{i}];"
for j, (t, p, vol) in enumerate(FX, len(SAY) + 1):
    ins += ["-i", p]; fc += f"[{j}:a]aformat=channel_layouts=stereo,volume={vol},adelay={int(t*1000)}:all=1[n{j}];"
n = len(SAY) + len(FX)
fc += "[0:a]" + "".join(f"[n{i}]" for i in range(1, n + 1)) + f"amix=inputs={n + 1}:normalize=0:duration=first[a]"
MIXED = os.path.join(D, "mix.wav")
subprocess.run([F, "-v", "error", "-y", *ins, "-filter_complex", fc, "-map", "[a]", MIXED], check=True)
# subtitles under the headline (y 392); skipped where the headline already says it (X, Luna) and the end card
CAP = subtitles([(t, tts(line)[0]) for t, line in SAY if not line.startswith(("Look closely", "Anything", "Read the"))], y=392)
VO = os.path.join(D, "vo.mp4")
subprocess.run([F, "-v", "error", "-y", "-i", CAT, "-i", MIXED, "-vf", ",".join(CAP), "-map", "0:v", "-map", "1:a",
                "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "20",
                "-c:a", "aac", "-b:a", "128k", VO], check=True)
c = Cut(); c.segs = [VO]; c.save(OUT, bed=True)
