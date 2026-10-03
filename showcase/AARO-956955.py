"""Showcase Short for AARO-956955 (Navy 2021 Flyby): the object is in only 3 of 289 frames
(268-270, ~8.94 s). Cut: tease (frame 0 = thumbnail: empty sky, its path boxed, no spoiler) -> 6.0-9.64 s at normal
speed, box on -> same moment 8x slower -> frames 266-272 stepped with the object boxed -> lesson on the zoomed object ->
"step through it frame by frame" end card -> back to the tease (loop). ElevenLabs narration + ambient bed. 9:16, ~28.1 s.

    FFMPEG=/path/to/ffmpeg-with-drawtext CLIP_FONT=/path/Bold.ttf python3 showcase/AARO-956955.py

Writes showcase/AARO-956955.mp4; post it with
    scripts/publish.sh --showcase AARO-956955 showcase/AARO-956955.mp4 "TEXT"
"""
import os, subprocess, sys, tempfile
F = os.environ.get("FFMPEG", "ffmpeg"); FONT = os.environ.get("CLIP_FONT", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")
HERE = os.path.dirname(os.path.abspath(__file__)); D = tempfile.mkdtemp(prefix="showcase-")
U = "https://assets.realufo.org/videos/aaro/DOD_108981629.mp4"
OUT = os.path.join(HERE, "AARO-956955.mp4")
for n in range(266, 273):  # the frames around the 3 that show the object, cropped out of the pillarbox
    subprocess.run([F, "-v", "error", "-y", "-i", U, "-vf", f"select='eq(n\\,{n})',crop=616:1080:652:0", "-frames:v", "1", "-fps_mode", "vfr", f"{D}/f{n}.png"], check=True)
def tf(name, text):
    p=f"{D}/{name}.txt"; open(p,"w").write(text); return p
T = "fontfile=%s:fontcolor=white:borderw=4:bordercolor=black:shadowcolor=black@0.6:shadowx=2:shadowy=2:x=(w-text_w)/2" % FONT
def txt(name, text, y, fs, color="white"):
    return f"drawtext={T.replace('fontcolor=white','fontcolor='+color)}:textfile={tf(name,text)}:expansion=none:fontsize={fs}:y={y}"
FIT = "crop=616:1080:652:0,scale=1095:1920,crop=1080:1920:7:0"
ENC = ["-r","30","-c:v","libx264","-profile:v","high","-pix_fmt","yuv420p","-preset","veryfast","-crf","20",
       "-c:a","aac","-b:a","128k","-ar","44100","-ac","2","-shortest","-movflags","+faststart"]
SIL = ["-f","lavfi","-i","anullsrc=channel_layout=stereo:sample_rate=44100"]
site = txt("site","realufo.org",1420,52)
segs=[]
def run(args, out):
    subprocess.run([F,"-v","error","-y",*args,*ENC,out],check=True); segs.append(out)
# H: tease on frame 0 (often the thumbnail): the empty sky the object is about to cross, boxed.
# Shows WHERE to look, not WHAT; the reveal is the payoff (a zoomed object at frame 0 spoils it)
zx,zy=186,524
ZOOM=f"crop=308:548:{zx-154}:{zy-274},scale=1080:1920:flags=lanczos"
BOX="drawbox=x=10:y=660:w=800:h=500:color=yellow@0.95:t=9"  # covers the object's path over frames 268-270
TEASE=[FIT,BOX,txt("h1","Something flies",250,84),txt("h2","through this box",345,84,"yellow"),txt("h3","in 1/10 of a second",1200,62),txt("hq","?",780,260,"yellow").replace("x=(w-text_w)/2","x=410-text_w/2"),site]
run(["-loop","1","-t","2.5","-i",f"{D}/f266.png",*SIL,"-vf",",".join(TEASE),"-map","0:v","-map","1:a","-t","2.5"], f"{D}/sh.mp4")
# A: normal speed from 6.0 s, box still on, so the pass lands ~5.4 s into the Short (not buried at ~10 s)
run(["-ss","6.0","-i",U,*SIL,"-vf",",".join([FIT,"fps=30",BOX,txt("a1","Watch the box",290,84),site]),"-map","0:v","-map","1:a","-t","3.64"], f"{D}/s0.mp4")
# A2: the same moment 8x slower (0.75 s -> 6 s; each source frame held 8x)
run(["-ss","8.6","-t","0.75","-i",U,*SIL,"-vf",",".join([FIT,"setpts=8*PTS","fps=30",txt("a2","Did you catch it?",290,84),txt("a3","8x slower",380,66,"yellow"),site]),"-map","0:v","-map","1:a","-t","6"], f"{D}/s1.mp4")
# B: frames 266-272 stepped, object marked on 268-270
hold={266:.45,267:.45,268:1.4,269:1.4,270:1.4,271:.45,272:.45}
pos={268:(15,614),269:(186,524),270:(416,416)}
for n,d in hold.items():
    vf=[FIT]
    if n in pos:
        x,y=pos[n]; X=round(x*1.7778)-7; Y=round(y*1.7778)
        vf.append(f"drawbox=x={max(X-65,0)}:y={Y-65}:w=130:h=130:color=yellow@0.95:t=7")
    vf += [txt(f"b1_{n}","Only 3 of 289 frames",270,78), txt(f"b2_{n}","show it",360,78),
           txt(f"b3_{n}",f"FRAME {n} / 289",1300,66,"yellow" if n in pos else "white"), site]
    run(["-loop","1","-t",str(d),"-i",f"{D}/f{n}.png",*SIL,"-vf",",".join(vf),"-map","0:v","-map","1:a","-t",str(d)], f"{D}/s{n}.mp4")
# L: the lesson, on the object up close (record summary: shown to Congress to demonstrate how fast aircraft approach)
run(["-loop","1","-t","5.4","-i",f"{D}/f269.png",*SIL,"-vf",",".join([ZOOM,"drawbox=x=410:y=830:w=260:h=260:color=yellow@0.95:t=9",
    txt("l1","Shown to Congress, 2022:",250,70), txt("l2","how fast jets close in",340,70,"yellow"),
    txt("l3","on the unknown",425,70,"yellow"), txt("l4","Navy pilot  ·  2021",1300,56), site]),"-map","0:v","-map","1:a","-t","5.4"], f"{D}/sl.mp4")
# C: end card, zoom on frame 269
vf=[ZOOM,
    txt("c1","Step through it",250,84), txt("c2","frame by frame",345,84),
    txt("c3","realufo.org/doc/AARO-956955",1380,50,"yellow"), site.replace(":y=1420",":y=1450")]
vf[-1]=txt("c4","AARO-956955  ·  Navy 2021 Flyby",1460,44)
run(["-loop","1","-t","4.0","-i",f"{D}/f269.png",*SIL,"-vf",",".join(vf),"-map","0:v","-map","1:a","-t","4.0"], f"{D}/s9.mp4")
# E: loop tail, back on the frame-0 tease so the replay starts seamlessly
run(["-loop","1","-t","0.6","-i",f"{D}/f266.png",*SIL,"-vf",",".join(TEASE),"-map","0:v","-map","1:a","-t","0.6"], f"{D}/se.mp4")
open(f"{D}/list.txt","w").write("".join(f"file '{s}'\n" for s in segs))
CAT=f"{D}/cat.mp4"
subprocess.run([F,"-v","error","-y","-f","concat","-safe","0","-i",f"{D}/list.txt","-c","copy","-movflags","+faststart",CAT],check=True)
# ElevenLabs narration at fixed cues (s); quiet from 3.7 s so the pass at ~5.4 s plays clean
sys.path.insert(0, HERE); import lib
SAY = [(0.2, "Something flies through this box. You get a tenth of a second."),
       (6.4, "Did you catch it? Eight times slower."),
       (15.2, "Frame by frame. Three frames, then gone."),
       (18.4, "The Navy showed Congress this clip: it is how fast jets close in on the unknown."),
       (23.7, "Step through any video, frame by frame, on real U F O dot org.")]
ins, fc = ["-i", CAT], ""
for i, (t, line) in enumerate(SAY, 1):
    ins += ["-i", lib.tts(line)[0]]; fc += f"[{i}:a]aformat=channel_layouts=stereo,adelay={int(t*1000)}:all=1[n{i}];"
fc += "[0:a]" + "".join(f"[n{i}]" for i in range(1, len(SAY)+1)) + f"amix=inputs={len(SAY)+1}:normalize=0:duration=first[a]"
VO=f"{D}/vo.mp4"
subprocess.run([F,"-v","error","-y",*ins,"-filter_complex",fc,"-map","0:v","-map","[a]","-c:v","copy","-c:a","aac","-b:a","128k","-movflags","+faststart",VO],check=True)
c = lib.Cut(); c.segs = [VO]; c.save(OUT, bed=True)  # + the synthesized ambient bed, as the article Shorts
