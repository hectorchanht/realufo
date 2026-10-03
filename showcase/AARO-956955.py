"""Showcase Short for AARO-956955 (Navy 2021 Flyby): the object is in only 3 of 289 frames
(268-270, ~8.94 s). Cut: hook still (zoom on 269, object boxed; frame 0 = thumbnail) -> whole original once -> same moment 8x slower -> frames 266-272 stepped
with the object boxed -> zoom on 269 + "step through it frame by frame" end card. 9:16, ~26.2 s.

    FFMPEG=/path/to/ffmpeg-with-drawtext CLIP_FONT=/path/Bold.ttf python3 showcase/AARO-956955.py

Writes showcase/AARO-956955.mp4; post it with
    scripts/publish.sh --showcase AARO-956955 showcase/AARO-956955.mp4 "TEXT"
"""
import os, subprocess, tempfile
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
# H: hook on frame 0 (often the thumbnail): zoom on frame 269 with the object boxed
zx,zy=186,524
ZOOM=f"crop=308:548:{zx-154}:{zy-274},scale=1080:1920:flags=lanczos"
run(["-loop","1","-t","1.5","-i",f"{D}/f269.png",*SIL,"-vf",",".join([ZOOM,"drawbox=x=410:y=830:w=260:h=260:color=yellow@0.95:t=9",
    txt("h1","Only 3 of 289 frames",270,78), txt("h2","show this",360,78,"yellow"), site]),"-map","0:v","-map","1:a","-t","1.5"], f"{D}/sh.mp4")
# A: the moment at normal speed
run(["-i",U,*SIL,"-vf",",".join([FIT,"fps=30",txt("a1","Watch closely",290,84),site]),"-map","0:v","-map","1:a","-t","9.64"], f"{D}/s0.mp4")
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
# C: end card, zoom on frame 269
vf=[ZOOM,
    txt("c1","Step through it",250,84), txt("c2","frame by frame",345,84),
    txt("c3","realufo.org/doc/AARO-956955",1380,50,"yellow"), site.replace(":y=1420",":y=1450")]
vf[-1]=txt("c4","AARO-956955  ·  Navy 2021 Flyby",1460,44)
run(["-loop","1","-t","3.2","-i",f"{D}/f269.png",*SIL,"-vf",",".join(vf),"-map","0:v","-map","1:a","-t","3.2"], f"{D}/s9.mp4")
open(f"{D}/list.txt","w").write("".join(f"file '{s}'\n" for s in segs))
subprocess.run([F,"-v","error","-y","-f","concat","-safe","0","-i",f"{D}/list.txt","-c","copy","-movflags","+faststart",OUT],check=True)
print("done", os.path.getsize(OUT)//1024, "KB")
