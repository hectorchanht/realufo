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

- `AARO-956955`: the object is in only 3 of 289 frames → normal, 8x slow, frame-by-frame (posted 2026-10-03). Re-cut 2026-10-03 to open on a hook still (zoom on frame 269, object boxed): frame 0 is often the thumbnail; re-cut not posted.
- `FBI-UAP-PR003`: tease Short (making-shorts skill): the "plasma-like sphere" swells from dot to soft disc and back at 2:45-2:49, out-of-focus lights = bokeh, posed as a question; FBI agents' own sighting (D007 p.2) for balance. Draft, not posted.
- `DOW-UAP-PR116`: tease Short: speck in the brackets -> sensor zoom -> lobed cluster (+ Ironbow) -> D091 p.1 boxes light up (round, square, balloon-shaped, metallic…) -> crew: "somewhat deformed balloon, but we were unable to verify" (p.2) -> foil balloons lesson, file Unresolved -> "Zoom in yourself". Draft, not posted.
- Articles (story across records + narrated Short): `articles/<slug>/`, published with
  `scripts/article.py` (publish-article skill): `teardrop-twins` (PR028 vs PR029, posted
  2026-10-03), `two-stars` (PR038 vs PR104, site only, Short awaiting approval).

## Planned (deferred)


