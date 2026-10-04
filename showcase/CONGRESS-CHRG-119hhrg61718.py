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
Analysis (user: "use math ... solve the mystery"; numbers computed below, asserted): 30 fps; HUD slant 3.1 NM
= 5.74 km (HUD self-check: 24.5k-12.2k ft gap -> ground 4.35 km vs HUD 2.4 NM 4.44 km); FOV 0.2636 deg over
640 px (Zaine M. estimate for this crop) -> 1 px = 4.1 cm. Missile tracked f578-592: 10.0 px/frame at 31 deg
= 12 m/s across the screen; the piece leaving f596-612: 9.0 px/frame at 27 deg -> same line, ~90% speed:
it went through, not off. Hellfire up to Mach 1.3 (Wikipedia; 250-426 m/s) -> path 1.7-2.8 deg off our line
of sight (depth hidden). Orb core 16-17 px = ~0.7 m (matches Metabunk's 3D fit), drifts ~1.2 m/s after.
p = 48 kg x 250-426 m/s = 12,000-20,400 kg m/s; reversing it while changing < 5 m/s needs >= 4.8-8.2 t in a
0.7 m ball = 29,000-49,500 kg/m3, denser than osmium (22,590). Thin, light target torn through fits all of it.
Cut: tease -> real speed + lens -> "No flash at contact" -> Congress heard "bounced right off" (Full Text p.46
card) -> M1 measure it (6x, Ironbow, cyan trail dots, scale built step by step) -> M2 after contact: "Through,
not off." -> M3 line-of-sight diagram -> M4 momentum card -> AARO look-alike (player, verdict) + Pentagon
"no comment" -> end card on Full Text p.32 -> loop. ~50 s.

    FFMPEG=/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg CLIP_FONT=$HOME/Library/Fonts/DejaVuSans-Bold.ttf \
        python3 showcase/CONGRESS-CHRG-119hhrg61718.py
"""
import math, os, subprocess
from lib import Cut, txt, tts, sfx, stamp, subtitles, IRONBOW, FFMPEG as F, FONT, TMP as D, ENC, SILENT as SIL, HERE

ID = "CONGRESS-CHRG-119hhrg61718"
SRC = os.path.join(HERE, ".src", "hellfire-burlison.mp4")
BALLOON = "https://assets.realufo.org/videos/aaro/DOD_111038535.mp4"  # AARO-DOD_111038535
OUT = os.path.join(HERE, f"{ID}.mp4")
INK, AMB, CYAN = "0xe7ecf4", "0xffb648", "0x46dfff"  # the site's dark tokens (--ink, --amber, --cyan)
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
# ---- the measurements (frame-tracked source pixels; see docstring) ----
FPS, W_PX, FOV_DEG = 30, 640, 0.2636           # clip fps; FOV of this crop: Zaine M. (Metabunk) estimate
RANGE = 3.1 * 1852                             # HUD slant range at contact, NM -> m (last digit cut off)
MPP = math.radians(FOV_DEG) / W_PX * RANGE     # metres per pixel at the orb (~4.1 cm)
PRE = [(578, 168, 100), (580, 182, 112), (582, 201, 126), (584, 222, 137), (586, 238, 148), (588, 257, 158),
       (590, 278, 167), (592, 288, 171)]       # missile before contact
POST = [(596, 340, 187), (598, 361, 190), (600, 380, 196), (602, 399, 205), (604, 415, 215), (606, 427, 220),
        (608, 444, 241), (610, 454, 249), (612, 469, 252)]   # the piece leaving on the far side
def rate(pts):
    (f0, x0, y0), (f1, x1, y1) = pts[0], pts[-1]
    return math.hypot(x1 - x0, y1 - y0) / (f1 - f0), math.degrees(math.atan2(y1 - y0, x1 - x0))
(PX_PRE, ANG_PRE), (PX_POST, ANG_POST) = rate(PRE), rate(POST)
V_SCREEN = PX_PRE * FPS * MPP                  # ~12 m/s across the screen
V_LO, V_HI = 250, 426                          # Hellfire: up to Mach 1.3 (~426 m/s at 12,000 ft); 250 = slowed, coasting
LOS_LO, LOS_HI = (math.degrees(math.asin(V_SCREEN / v)) for v in (V_HI, V_LO))
ORB_M = 16.5 * MPP                             # orb bright core 16-17 px (glare makes this an upper bound)
MASS = 48                                      # kg: Lockheed AGM-114R card 47.4, Wikipedia 49
P_LO, P_HI = MASS * V_LO, MASS * V_HI
VOL = 4 / 3 * math.pi * (ORB_M / 2) ** 3
BOUNCE_LO, BOUNCE_HI = 2 * P_LO / 5, 2 * P_HI / 5   # mass to reverse the missile and change speed < 5 m/s
RHO_LO, RHO_HI = BOUNCE_LO / VOL, BOUNCE_HI / VOL
assert 0.040 < MPP < 0.043 and 11 < V_SCREEN < 13.5 and abs(ANG_PRE - ANG_POST) < 6 and RHO_LO > 22_590  # osmium
k = lambda x: f"{round(x, -2):,.0f}"  # big numbers to the nearest 100

def dots(pts, f0, slow, frm_scale, frm_x0, frm_y0, after=0.4, always=False):
    """Cyan 10 px trail dots (amber vanishes on Ironbow) at measured positions, shown once the missile has moved on."""
    out = []
    for f, x, y in pts:
        X, Y = (x - frm_x0) * frm_scale, (y - frm_y0) * frm_scale + 470
        en = "" if always else f":enable='gte(t,{(f - f0) * slow / FPS + after:.2f})'"
        out.append(f"drawbox=x={X - 5:.0f}:y={Y - 5:.0f}:w=10:h=10:color={CYAN}@0.95:t=fill{en}")
    return out

def seq(lines, y, fs, color=AMB):
    """Lines that replace each other at one spot: [(t0, t1, text), ...]."""
    return [T(text, y, fs, color) + f":enable='gte(t,{t0})*lt(t,{t1})'" for t0, t1, text in lines]

MIDP = frame("crop=320:230:140:60", pre=IRONBOW + ",")   # mid zoom (x3.375 from 140,60), site Ironbow palette
SRCLINE = T(f"FOV {FOV_DEG:.2f}°: Metabunk (Zaine M.) estimate  ·  range: on-screen HUD", 1262, 26)
# X: freeze on contact: the open question (frame check: brightness flat, near-white pixels 204 -> 70)
still(596, TIGHT, [T("No flash at contact", 215, 80), T("Did it even explode?", 300, 80, AMB),
                   T("frame 596: no brightness spike around the orb", 1256, 32), CREDIT, site], 3.5)
# C: what Congress heard, on realufo.org's Full Text view (p.46 marked; Knapp is p.32)
site_card("hellfire-site-p46.jpg", 656, [T("Congress heard it", 215, 66), T("\"bounced right off\"", 300, 76, AMB),
          T("Knapp p.32  ·  witnesses p.46  ·  realufo.org full text", 1290, 30)], 4.1)
# M1: measure it: 6x slower up to contact, trail dots, the scale built step by step
run(["-i", SRC], ["trim=start_frame=576:end_frame=597,setpts=(PTS-STARTPTS)*6,fps=30,tpad=stop_mode=clone:stop_duration=3",
     MIDP, *dots(PRE, 576, 6, 3.375, 140, 60), T("Measure it", 215, 84),
     *seq([(0.3, 1.8, "30 frames per second"), (1.8, 3.3, f"range {RANGE/1000:.2f} km  (HUD: 3.1 NM)"),
           (3.3, 4.6, f"view {FOV_DEG:.2f}° across 640 px"), (4.6, 9, f"1 pixel = {MPP*100:.1f} cm")], 300, 52),
     SRCLINE, CREDIT, site], 6.4)
# M2: after contact: same line, ~90% of the screen speed -> it went through
run(["-i", SRC], ["trim=start_frame=596:end_frame=614,setpts=(PTS-STARTPTS)*3,fps=30,tpad=stop_mode=clone:stop_duration=3",
     MIDP, *dots(PRE, 576, 0, 3.375, 140, 60, always=True), *dots(POST, 596, 3, 3.375, 140, 60), T("After contact", 215, 84),
     *seq([(0.2, 1.6, f"before: {PX_PRE:.1f} px/frame  ({ANG_PRE:.0f}°)"),
           (1.6, 2.6, f"after: {PX_POST:.1f} px/frame  ({ANG_POST:.0f}°)"), (2.6, 9, "Through, not off.")], 300, 54),
     T("screen motion, camera locked on the orb", 1262, 26), CREDIT, site], 4.3)
# M3: why it looks slow: a line-of-sight diagram (the missile path is ~2° off our view)
DIAG = os.path.join(D, "diag.png")
cx, cy, ox, oy = 150, 1240, 880, 760
L = math.hypot(ox - cx, oy - cy); ux, uy = (cx - ox) / L, (cy - oy) / L          # from orb back to camera
a = math.radians(2.3); mx, my = ux * math.cos(a) - uy * math.sin(a), ux * math.sin(a) + uy * math.cos(a)
sx, sy, ex, ey = ox + mx * 760, oy + my * 760, ox - mx * 150, oy - my * 150   # missile path, through the orb and on
def seg_d(x0, y0, x1, y1):
    dx, dy = x1 - x0, y1 - y0; n = math.hypot(dx, dy)
    return f"abs((X-{x0:.1f})*{dy:.3f}-(Y-{y0:.1f})*{dx:.3f})/{n:.3f}", f"between(X\\,{min(x0, x1):.0f}\\,{max(x0, x1):.0f})"
d1, b1 = seg_d(cx, cy, ox, oy); d2, b2 = seg_d(sx, sy, ex, ey)
on1, on2 = f"lt({d1}\\,2.5)*{b1}", f"lt({d2}\\,3)*{b2}"
dot = f"lt(hypot(X-{ox}\\,Y-{oy})\\,14)"
ch = lambda bg, l1, l2: f"if({dot}\\,231\\,if({on2}\\,{l2}\\,if({on1}\\,{l1}\\,{bg})))"
subprocess.run([F, "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0x07080c:s=1080x1920", "-vf",
                f"format=rgb24,geq=r='{ch(7, 231, 255)}':g='{ch(8, 236, 182)}':b='{ch(12, 244, 72)}'", "-frames:v", "1", DIAG], check=True)
run(["-loop", "1", "-t", "6.6", "-i", DIAG], [
    T("Why it looks so slow", 215, 74), T("It flies almost along our view", 300, 56, AMB),
    f"drawtext=fontfile={FONT}:text='MQ-9 camera':fontcolor={INK}:fontsize=34:borderw=3:bordercolor=black:x=110:y=1265",
    f"drawtext=fontfile={FONT}:text='orb':fontcolor={INK}:fontsize=34:borderw=3:bordercolor=black:x=905:y=775",
    f"drawtext=fontfile={FONT}:text='line of sight  ·  missile path (2° apart)':fontcolor={INK}:fontsize=30:borderw=3:bordercolor=black:x=330:y=1180",
    *seq([(0.3, 9, f"Hellfire: up to Mach 1.3  =  {V_LO}–{V_HI} m/s")], 470, 42, INK),
    *seq([(2.0, 9, f"on screen: {PX_PRE:.0f} px × {MPP*100:.1f} cm × 30  =  {V_SCREEN:.0f} m/s")], 530, 42, INK),
    *seq([(3.8, 9, f"angle to our view: {LOS_LO:.1f}–{LOS_HI:.1f}°")], 600, 54),
    T("speed: AGM-114 published max  ·  depth is invisible on screen", 1300, 26), site], 6.6)
# M4: momentum: what a "bounce" would demand of a 70 cm orb
still(650, TIGHT, ["eq=brightness=-0.42", T("Momentum check", 215, 80), T("p = m × v", 300, 64, AMB),
    *seq([(0.3, 11, f"{MASS} kg × {V_LO}–{V_HI} m/s = {k(P_LO)}–{k(P_HI)} kg·m/s")], 520, 42, INK),
    *seq([(2.4, 11, f"orb: ~{ORB_M*100:.0f} cm, drifts ~1 m/s after")], 610, 42, INK),
    *seq([(4.0, 11, "to bounce it and barely budge (< 5 m/s):")], 720, 42, INK),
    *seq([(4.9, 11, f"orb ≥ {BOUNCE_LO/1000:.1f}–{BOUNCE_HI/1000:.1f} tonnes")], 800, 60),
    *seq([(6.0, 11, f"= {k(RHO_LO)}–{k(RHO_HI)} kg/m³")], 900, 50),
    *seq([(6.8, 11, "densest metal, osmium: 22,590 kg/m³")], 985, 40, INK),
    *seq([(8.6, 11, "Thin and light? It just tears.")], 1120, 60),
    T("mass: Lockheed AGM-114R card / Wikipedia  ·  our arithmetic", 1300, 26), site], 10.4)
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
# narration cues (s); quiet 4.0-6.3 so the contact (~4.7 s) plays clean
SAY = [(0.2, "A drone fires a Hellfire missile at this orb. Watch the crosshair."),
       (6.4, "Look closely. No flash at contact. Did it even explode?"),
       (9.9, "Congress heard it bounced right off, and that nothing we have could do that."),
       (14.0, "Measure it. Thirty frames a second, five point seven kilometres away. One pixel is four centimetres."),
       (20.4, "After contact: same line, ninety percent speed. It went through, not off."),
       (24.7, "A Hellfire flies hundreds of metres a second. On screen, twelve. It's flying almost along our line of sight."),
       (31.3, "Momentum check. To bounce this missile and barely budge, a seventy centimetre orb needs tonnes. Denser than any metal. A thin, light target just tears."),
       (41.7, "In 2024, the Pentagon's U F O office called a look-alike orb a foil balloon."),
       (46.4, "Read the hearing, page thirty two, on real U F O dot org.")]
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
# subtitles under the headline (y 392); skipped where the screen already carries it (X, C, the M3/M4 cards, end card)
CAP = subtitles([(t, tts(line)[0]) for t, line in SAY
                 if not line.startswith(("Look closely", "Congress", "A Hellfire flies", "Momentum", "Read the"))], y=392)
VO = os.path.join(D, "vo.mp4")
subprocess.run([F, "-v", "error", "-y", "-i", CAT, "-i", MIXED, "-vf", ",".join(CAP), "-map", "0:v", "-map", "1:a",
                "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "20",
                "-c:a", "aac", "-b:a", "128k", VO], check=True)
c = Cut(); c.segs = [VO]; c.save(OUT, bed=True)
