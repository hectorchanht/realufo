# Showcase Shorts

Hand-made 9:16 Shorts about a single record (slow motion, frame-by-frame, zooms…) that show
what realufo.org's media tools reveal and a plain clip hides.

- `<RECORD_ID>.py`: the recipe (ffmpeg with `drawtext` + a bold TTF; see each file's docstring).
- `<RECORD_ID>.mp4`: the render (git-ignored; the posted copy lives in R2 at `showcase/<archive>/<ID>.mp4`).

Post one (X first, then the social fan-out, once per record):

```bash
scripts/publish.sh --showcase AARO-956955 showcase/AARO-956955.mp4 "only 3 of 289 frames show it 👀 step through it frame by frame"
```
