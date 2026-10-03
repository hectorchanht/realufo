# Showcase Shorts

Hand-made 9:16 Shorts about a single record (slow motion, frame-by-frame, zooms…) that show
what realufo.org's media tools reveal and a plain clip hides.

- `<RECORD_ID>.py`: the recipe (ffmpeg with `drawtext` + a bold TTF; see each file's docstring).
- `lib.py`: shared helpers (safe-zone text, segments, concat, the site's Ironbow ramp).
- `<RECORD_ID>.mp4`: the render (git-ignored; the posted copy lives in R2 at `showcase/<archive>/<ID>.mp4`).

Post one (X first, then the social fan-out, once per record):

```bash
scripts/publish.sh --showcase AARO-956955 showcase/AARO-956955.mp4 "only 3 of 289 frames show it 👀 step through it frame by frame"
```

## Made

- `AARO-956955`: the object is in only 3 of 289 frames → normal, 8x slow, frame-by-frame (posted 2026-10-03).
- Articles (story across records + narrated Short): `articles/<slug>/`, published with
  `scripts/article.py` (publish-article skill): `teardrop-twins` (PR028 vs PR029, posted
  2026-10-03), `two-stars` (PR038 vs PR104, site only, Short awaiting approval).

## Planned (deferred)

- `DOW-UAP-PR116`: demo the zoom-in function once it's built on the doc page (user, 2026-10-03).
