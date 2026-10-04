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

def enh(tag, pal=""):
    """Real-detail enhancement at source resolution (no invented pixels): denoise, large-radius local contrast
    (A + 0.9*(A - blur16(A)): flattens the sensor's bright centre glow so the orb/missile stand out), a curve
    that sinks the grey sea haze, then (palette,) lanczos upscale and CAS sharpening."""
    return (f"hqdn3d=4:3:6:4,format=gray,split[la{tag}][lb{tag}];[lb{tag}]gblur=sigma=16[lc{tag}];"
            f"[la{tag}][lc{tag}]blend=all_expr='clip(A+(A-B)*0.9\\,0\\,255)',curves=all='0/0 0.5/0.42 0.85/0.78 1/1',"
            f"{pal + ',' if pal else ''}scale=1080:-2:flags=lanczos,cas=0.6")

def frame(crop, spot, pal=""):
    """The enhanced shot over a blurred, darkened full-screen copy of itself (the whole 9:16 is used, no black
    bars); `crop` of the 640x328 source scaled to 1080 wide at y 470, labelled as enhanced. (`spot`: where the
    eye should go, fg coords; a vignette there left black corner arcs, so it's unused for now.)"""
    return (f"split[fg][bk];[bk]{pal + ',' if pal else ''}scale=-2:1920,crop=1080:1920,{BLUR}[bg];"
            f"[fg]{crop},{enh('f', pal)}[v0];[bg][v0]overlay=0:470,"
            f"drawtext=fontfile={FONT}:text='enhanced\\: denoise · contrast · sharpen (no AI)':fontcolor={INK}@0.85:"
            "fontsize=24:borderw=2:bordercolor=black:x=18:y=482")

VIEW = frame("crop=400:288:120:20", (540, 437))     # wide: x2.7, orb at screen (540,907)
MID = frame("crop=320:230:140:60", (607, 412))      # x3.4: orb (607,882), missile entry (91,602)
TIGHT = frame("crop=240:173:200:100", (540, 369))   # x4.5 on the contact

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
def still(f, frm, vf, secs, stack=0):
    """A held frame; `stack`=N averages N frames ending at f (only while the camera tracks the orb), else a light nlmeans."""
    if f not in STILL:
        STILL[f] = os.path.join(D, f"f{f}.png")
        pick = (f"trim=start_frame={f - stack + 1}:end_frame={f + 1},tmix=frames={stack},select=eq(n\\,{stack - 1})"
                if stack else f"select=eq(n\\,{f})")
        subprocess.run([F, "-v", "error", "-y", "-i", SRC, "-vf", f"{pick}{'' if stack else ',nlmeans=s=1.5:p=5:r=11'}", "-frames:v", "1", STILL[f]], check=True)
    run(["-loop", "1", "-t", str(secs), "-i", STILL[f]], [frm, *vf], secs)

def lens_clip(f0, f1, vf, secs):
    """Wide view + a borderless 2.7x lens on the contact area (source 150x150 at 245,107); nothing drawn on the object."""
    out = os.path.join(D, f"seg{len(segs)}.mp4")
    fc = (f"[0:v]trim=start_frame={f0}:end_frame={f1},setpts=PTS-STARTPTS,fps=30,split[a][b];"
          f"[a]{VIEW},{','.join(vf)}[base];"
          f"[b]crop=150:150:245:107,{enh('l')},scale=400:400:flags=lanczos,format=rgba[lz];"
          "[1:v]format=gray[m];[lz][m]alphamerge[lm];"
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
still(560, MID, TEASE, 2.5, stack=7)
# A: real speed, wide + lens; impact ~4.7 s in (f595)
lens_clip(530, 644, [T("Watch the crosshair", 215, 80), T("real speed", 1258, 50, AMB), CREDIT, site], 3.8)
# ---- the measurements (double-checked 2026-10-04; asserts below fail the build if they drift) ----
FPS, W_PX, H_PX = 30, 640, 328
R_LO, R_HI = 3.10 * 1852, 3.19 * 1852          # HUD slant range at contact "3.1x" NM (last digit cropped)
# scale (m per px at the orb): Zaine M. FOV estimate for this crop (0.2636 deg across) = best; Mick West's
# background fit (0.1 deg vertical) = low; Raytheon MTS-B spec IR ultra-narrow 0.31 deg across (no e-zoom) = high
MPP = math.radians(0.2636) / W_PX * R_LO
MPP_LO, MPP_HI = math.radians(0.1) / H_PX * R_LO, math.radians(0.31) / W_PX * R_HI
# missile blob centroids, auto-tracked frame by frame (brightness-weighted, see docstring)
PRE = [(578, 170, 102), (579, 178, 109), (580, 186, 115), (581, 195, 121), (582, 204, 128), (583, 213, 133),
       (584, 222, 139), (585, 231, 144), (586, 239, 149), (587, 249, 155), (588, 258, 159), (589, 268, 164),
       (590, 278, 167), (591, 288, 171), (592, 299, 175)]
POST = [(597, 354, 189), (598, 361, 191), (599, 372, 194), (600, 382, 197), (601, 392, 201), (602, 401, 205),
        (603, 410, 210), (604, 418, 215), (605, 426, 221), (606, 433, 227), (607, 439, 233), (608, 445, 240),
        (609, 451, 246), (610, 457, 254), (611, 463, 262), (612, 469, 270)]
def rate(pts):
    """Least-squares px/frame and heading (deg below horizontal) of a track."""
    n = len(pts); ks, xs, ys = zip(*pts); mk, mx, my = sum(ks) / n, sum(xs) / n, sum(ys) / n
    sxx = sum((k - mk) ** 2 for k in ks)
    bx = sum((k - mk) * (x - mx) for k, x in zip(ks, xs)) / sxx; by = sum((k - mk) * (y - my) for k, y in zip(ks, ys)) / sxx
    return math.hypot(bx, by), math.degrees(math.atan2(by, bx))
(PX_PRE, ANG_PRE), (PX_POST, ANG_POST) = rate(PRE), rate(POST)
V_SCR = PX_PRE * FPS * MPP                              # ~13 m/s across the screen
V_SCR_LO, V_SCR_HI = PX_PRE * FPS * MPP_LO, PX_PRE * FPS * MPP_HI
V_LO, V_HI = 250, 445                                  # Hellfire: published max Mach 1.3 = 1,600 km/h; 250 = slowed
LOS_LO, LOS_HI = math.degrees(math.asin(V_SCR_LO / V_HI)), math.degrees(math.asin(V_SCR_HI / V_LO))
ORB_PX = 16.5                                          # orb bright core 16-17 px (glare: upper bound)
ORB_LO, ORB, ORB_HI = ORB_PX * MPP_LO, ORB_PX * MPP, ORB_PX * MPP_HI
MASS = 48                                              # kg: Lockheed AGM-114R card 47.4, Wikipedia 45-49
P_LO, P_HI = MASS * V_LO, MASS * V_HI
KE_LO, KE_HI = MASS * V_LO ** 2 / 2, MASS * V_HI ** 2 / 2
CAR = 1500                                             # kg, a family car
car_kmh = lambda ke: round(math.sqrt(2 * ke / CAR) * 3.6, -1)  # same kinetic energy as that car at ... km/h
M_LO, M_HI = 2 * P_LO / 5, 2 * P_HI / 5                # mass to send the missile back and change speed < 5 m/s
vol = lambda d: 4 / 3 * math.pi * (d / 2) ** 3
RHO_WORST, RHO_BEST = M_LO / vol(ORB_HI), M_LO / vol(ORB)
LEAD, OSMIUM = 11_340, 22_590
assert 0.029 < MPP_LO < MPP < MPP_HI < 0.051 and abs(ANG_PRE - ANG_POST) < 7 and 0.85 < PX_POST / PX_PRE < 0.95
assert RHO_WORST > LEAD and RHO_BEST > OSMIUM and 1 < LOS_LO < LOS_HI < 4
k = lambda x: f"{round(x, -2):,.0f}"

def dots(pts, f0, slow, frm_scale, frm_x0, frm_y0, after=0.4, always=False, every=2):
    """Cyan 10 px trail dots (amber vanishes on Ironbow) at the tracked positions, shown once the missile has moved on."""
    out = []
    for f, x, y in pts[::every]:
        X, Y = (x - frm_x0) * frm_scale, (y - frm_y0) * frm_scale + 470
        en = "" if always else f":enable='gte(t,{(f - f0) * slow / FPS + after:.2f})'"
        out.append(f"drawbox=x={X - 5:.0f}:y={Y - 5:.0f}:w=10:h=10:color={CYAN}@0.95:t=fill{en}")
    return out

def seq(lines, y, fs, color=AMB):
    """Lines that replace each other at one spot: [(t0, t1, text), ...]."""
    return [T(text, y, fs, color) + f":enable='gte(t,{t0})*lt(t,{t1})'" for t0, t1, text in lines]

def at(t0, text, y, fs, color=INK):
    return T(text, y, fs, color) + f":enable='gte(t,{t0})'"

MIDP = frame("crop=320:230:140:60", (607, 412), pal=IRONBOW)   # mid zoom (x3.375 from 140,60), site Ironbow palette
# X: freeze on contact: the open question (frame check: brightness flat, near-white pixels 204 -> 70)
still(596, TIGHT, [T("No flash at contact", 215, 80), T("Did it even explode?", 300, 80, AMB),
                   T("frame 596: no brightness spike around the orb", 1256, 32), CREDIT, site], 3.5)
# C: what Congress heard, on realufo.org's Full Text view (p.46 marked; Knapp is p.32)
site_card("hellfire-site-p46.jpg", 656, [T("Congress heard it", 215, 66), T("\"bounced right off\"", 300, 76, AMB),
          T("Knapp p.32  ·  witnesses p.46  ·  realufo.org full text", 1290, 30)], 4.1)
# M1: measure it: 6x slower up to contact, trail dots, the scale built step by step, each with an everyday size
run(["-i", SRC], ["trim=start_frame=576:end_frame=597,setpts=(PTS-STARTPTS)*6,fps=30,tpad=stop_mode=clone:stop_duration=4",
     MIDP, *dots(PRE, 576, 6, 3.375, 140, 60), T("Measure it", 215, 84),
     *seq([(0.3, 1.8, "30 frames per second"), (1.8, 4.2, f"{R_LO/1000:.1f} km away  ≈  55 football fields"),
           (4.2, 5.8, "view: 0.26° across 640 pixels"), (5.8, 9, f"1 pixel ≈ {MPP*100:.0f} cm  ≈  a golf ball")], 300, 50),
     T("range: on-screen HUD 3.1 NM  ·  view: Metabunk est., Raytheon spec ≤ 0.31°", 1262, 26),
     T(f"scale {MPP_LO*100:.0f}–{MPP_HI*100:.0f} cm per pixel, best {MPP*100:.1f}", 1296, 26), CREDIT, site], 7.9)
# M2: after contact: same direction, ~90% of the screen speed -> it went through
run(["-i", SRC], ["trim=start_frame=596:end_frame=614,setpts=(PTS-STARTPTS)*3,fps=30,tpad=stop_mode=clone:stop_duration=4",
     MIDP, *dots(PRE, 576, 0, 3.375, 140, 60, always=True), *dots(POST, 597, 3, 3.375, 140, 60), T("After contact", 215, 84),
     *seq([(0.2, 1.8, f"before: {PX_PRE:.1f} px per frame"),
           (1.8, 3.2, f"after: {PX_POST:.1f}, turned {abs(ANG_POST - ANG_PRE):.0f}°"), (3.2, 9, "Through, not off.")], 300, 54),
     T("least-squares fit, 31 tracked frames", 1262, 28), CREDIT, site], 5.3)
# M3: why it looks slow: a line-of-sight diagram (the missile path is a thumb's width off our view)
DIAG = os.path.join(D, "diag.png")
cx, cy, ox, oy = 150, 1240, 880, 905
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
run(["-loop", "1", "-t", "10.7", "-i", DIAG], [
    T("Why it looks so slow", 215, 74), T("It flies almost along our view", 300, 56, AMB),
    f"drawtext=fontfile={FONT}:text='MQ-9 camera':fontcolor={INK}:fontsize=34:borderw=3:bordercolor=black:x=110:y=1265",
    f"drawtext=fontfile={FONT}:text='orb':fontcolor={INK}:fontsize=34:borderw=3:bordercolor=black:x=905:y=920",
    f"drawtext=fontfile={FONT}:text='line of sight  ·  missile path (2° apart)':fontcolor={INK}:fontsize=30:borderw=3:bordercolor=black:x=380:y=1200",
    at(0.3, f"on screen: {V_SCR:.0f} m/s", 450, 50), at(0.3, f"≈ {V_SCR*3.6:.0f} km/h, a city car", 510, 40),
    at(3.4, f"real Hellfire: up to {round(V_HI*3.6, -2):,.0f} km/h", 590, 50), at(3.4, "faster than an airliner", 650, 40),
    at(6.6, f"→ only {LOS_LO:.0f}–{LOS_HI:.0f}° off our view", 730, 56, AMB), at(7.6, "≈ your thumb at arm's length", 800, 40),
    T(f"speed: AGM-114 published max Mach 1.3, or {V_LO} m/s if slowed", 1296, 26),
    T(f"the range covers scale {MPP_LO*100:.0f}–{MPP_HI*100:.0f} cm per pixel", 1328, 26), site], 10.7)
# M4: weigh it: energy, then what a "bounce" would demand of a tyre-sized orb (worst case shown)
still(650, TIGHT, ["eq=brightness=-0.45", T("Now weigh it", 215, 80), T("energy  ·  momentum  ·  density", 300, 50, AMB),
    at(0.3, f"missile: {MASS} kg at {V_LO}–{V_HI} m/s", 530, 44),
    at(1.8, f"energy {KE_LO/1e6:.1f}–{KE_HI/1e6:.1f} MJ", 600, 50, AMB),
    at(1.8, f"= a car crash at {car_kmh(KE_LO):.0f}–{car_kmh(KE_HI):.0f} km/h", 662, 44, AMB),
    at(4.4, "before the warhead even counts", 722, 34),
    at(6.5, "to bounce it back and barely move:", 800, 42),
    at(8.0, f"orb ≥ {M_LO/1000:.1f}–{M_HI/1000:.1f} t  =  {M_LO/CAR:.0f}–{M_HI/CAR:.0f} cars", 868, 56, AMB),
    at(9.6, f"in a ball {ORB_LO*100:.0f}–{ORB_HI*100:.0f} cm wide, a car tyre", 940, 40),
    at(11.0, f"≥ {RHO_WORST/LEAD:.1f}× as dense as lead", 1010, 48), at(11.0, "best guess: beyond osmium", 1068, 36),
    at(13.4, "Thin and light? It just tears.", 1150, 58, AMB),
    T(f"momentum {k(P_LO)}–{k(P_HI)} kg·m/s  ·  mass 45–49 kg (Lockheed, Wikipedia)", 1262, 26),
    T("worst case shown  ·  barely move = under 5 m/s", 1296, 26),
    site], 15.9)
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
       (14.0, "Measure it. Thirty frames a second, five point seven kilometres away. That's fifty five football fields. One pixel is about a golf ball."),
       (21.9, "After contact: same direction, ninety percent of the speed. It went through, not off."),
       (27.2, "On screen it crawls at city-car speed. Real Hellfires fly faster than an airliner. So it's coming in almost straight along our view, a thumb's width off. Depth hides the hit."),
       (37.9, "Now weigh it. This missile hits with the energy of a car crash at two hundred kilometres an hour, before any explosive. To bounce that and barely move, a tyre-sized orb would weigh as much as five cars. Denser than lead. A thin, light target just tears."),
       (53.8, "In 2024, the Pentagon's U F O office called a look-alike orb a foil balloon."),
       (58.5, "Read the hearing, page thirty two, on real U F O dot org.")]
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
                 if not line.startswith(("Look closely", "Congress", "Measure it", "On screen", "Now weigh", "Read the"))], y=392)
VO = os.path.join(D, "vo.mp4")
subprocess.run([F, "-v", "error", "-y", "-i", CAT, "-i", MIXED, "-vf", ",".join(CAP), "-map", "0:v", "-map", "1:a",
                "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "20",
                "-c:a", "aac", "-b:a", "128k", VO], check=True)
c = Cut(); c.segs = [VO]; c.save(OUT, bed=True)
