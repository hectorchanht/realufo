---
name: making-shorts
description: Use when making, re-cutting, narrating or reviewing a vertical 9:16 Short (YouTube Shorts, TikTok, Instagram Reels, X video) about a RealUFO record or article: showcase/<ID>.py recipes, showcase/articles/<slug>/short/short.py, scripts/clips.py cuts.
---

# Making Shorts

Goal: the best piece of social media about this file. Viewers stop scrolling, enjoy all of it, leave feeling they **learnt something real**, and remember one line. Every Short is fun, eye-catching, informative and accurate.

## The shape (fill every slot)

| Beat | Time | What's in it |
|---|---|---|
| **Frame 0 = thumbnail = tease** | 0–2.5 s | The question, not the answer: show **where** to look (a big yellow box or "?" on the spot, plus a bold challenge headline), never the payoff. AARO-956955 shows an empty sky with "Something flies through this box in 1/10 of a second". No fade-in, black frame or title card. |
| **First payoff** | by ~5 s | The event itself (the pass, the split, the blink) inside the first ~5 s, with the tease box still on. Start the clip close to the moment. |
| **Show** | middle | The footage doing the work: slow-mo, then frame-step, then zoom. Something new every 2–3 s. |
| **Reveal + lesson** | | The answer, plus **one takeaway that makes the viewer smarter**: the physics, how the camera fools you, what the document actually says. |
| **Sound bite** | at the reveal | One quotable line, ≤8 words, said by the narrator **and** on screen: "Three frames. Then gone.", "Made on Earth." |
| **Do it yourself** | last 3–4 s | "Step through it frame by frame on realufo.org" plus `realufo.org/doc/<ID>` on screen. This is the only call to action. |
| **Loop** | last frame | End on the frame-0 image (or cut straight back into it) so the replay feels seamless. |

Length is 20–35 s. Get the hook in fast and the end card out fast.

**Why (2025–26 creator data, rules of thumb):** 50–60 % of drop-offs happen in the first 3 s, so viewers decide in about 1.5–2 s from frame 0 and the first line. Aim for ≥70 % "viewed vs swiped away" in YouTube Studio. Changing something every 2–3 s keeps people watching. Loops push average % viewed past 100 %. Most people watch **muted**. If the best moment is buried 15 s in, most viewers never see it.

## Facts (research first)

- Read the record in full first (`GET /api/records/ID` → summary, fullText, ai_moments). Then search the web for how others covered it. Lore that differs from the documents makes a strong angle ("the documents say X, not Y").
- Every claim must come from the record or a cited page. Quote documents word for word with "· p.N". Never invent authority ("analysts say", "authenticated", "highly credible") unless a page says it.
- Give each verdict in the document's own words, credited to whoever said it: "the witness said it didn't look like a reflection", never "the FBI says no".
- If AARO lists a file as unresolved, keep it unresolved. Give explanations as "consistent with …" or as a question.
- Look at the frames before claiming anything. Find blink frames with a contact sheet (`select=between(n\,A\,B),crop,scale,tile=…`).

## Sound (and silence)

- **Works on mute:** every narration line's key fact also appears as on-screen text in that beat (short form, not a transcript). Mute it and the story still lands.
- ElevenLabs narration via `lib.tts(line)` (cached), with the ambient bed from `Cut.save(out, bed=True)`.
- Write one short line per beat, spoken like a friend showing you something ("Did you catch it?"), not a press release. Spell out what the voice mangles: "real U F O dot org", "two hundred eighty-nine". On screen it must read "FBI" / "realufo.org", never the spelling: `lib.txt` converts it (`written()`), so never bypass `txt` for drawtext.
- Keep the voice **off** the key moment so the blink, split or pass plays clean.
- **Sound effects, used sparingly:** `lib.sfx("pen tick on a paper checkbox", 0.6)` uses ElevenLabs sound generation and is cached. Use one effect per meaningful event (a tick per box read aloud, a whoosh on the zoom), about 6 or fewer per Short. Keep them under the voice at about 0.5–0.8 volume and in the same `adelay` mix. No background sound-effect beds and no effect on every cut.
- **Subtitles: calm, one line per sentence.** The user tried word-by-word captions and found them hurried and distracting, so don't use them. `lib.subtitles([(t0, tts(line)[0]), …])` gives one line per sentence, ≤32 characters, at a fixed size (46). Long sentences are split at the most balanced point, preferring commas. Each line stays on screen whole until the next one starts. Word timings come from ElevenLabs speech-to-text (`lib.words`, cached). Put the line just under the headline (y≈460–470). If a beat fills that spot, move the line low (y≈1170). Skip a line that's already on screen word for word. Frame 0 stays caption-free.
- **What else the ElevenLabs key can do:** sound effects work, and speech-to-text, audio isolation and music are allowed. Account/user info and forced alignment are not (401), so speech-to-text (`lib.words`) supplies the timings for `lib.subtitles`. Check the music licence terms before using generated music.
- For fixed-length footage, measure each line with `lib.tts` first, place it at a cue (`SAY = [(t, line), …]`) and mix with `adelay`. Copy `showcase/FBI-UAP-PR003.py` or `showcase/DOW-UAP-PR116.py`: they have the cues, subtitles, ID watermark and two-step mix. Built from stills: `Cut.seg(..., say=line)` stretches each beat to fit.

## Always lead to realufo.org

Every Short exists to send people to the site. Show `realufo.org  ·  <ID>` on screen in every beat (`site`, y 1420). **The watermark carries the context too:** `site = lib.stamp(ID, "Nov 11, 1979  ·  Manises, Spain  ·  airliner crew")` puts a small line above the ID with **when** (year + month at least, the day/time of day if the file has it), **where** (the key place), and **who** (the witnesses or the unit, e.g. "F/A-18 pilots", "FBI agent"). Viewers dropping in mid-loop or seeing a repost then still know what they're looking at. Take every part from the record (date fields, fullText, pages), never guess; leave out a part the file doesn't give. The record ID works as a watermark: it's searchable on the site and credits the clip when it's reposted or screenshotted, so it's there from frame 0. A beat whose layout fills that spot must show the ID somewhere else (e.g. a document line). End on `realufo.org/doc/<ID>` plus what they can do there ("step through it", "zoom in yourself", "flip the palette"). Every post caption ends with the doc link too.

## Enhance (real detail only)

- **Frame stack:** when the sensor tracks the target, take the mean of 5–9 frames around the moment (`tmix=frames=9,select='eq(n\,8)'`). Noise drops and the target stays sharp. See `showcase/DOW-UAP-PR116.py`.
- **Denoise and sharpen:** `nlmeans=s=3:p=5:r=11` and then `cas=0.6` on stills, `hqdn3d=4:3:6:4` on moving footage. Upscale with `scale=…:flags=lanczos`.
- **Palettes:** use the site's own palettes (`lib.IRONBOW`), which double as a demo of the site's tools.
- **Label it:** put a small line on screen, e.g. "enhanced: 9-frame stack + denoise".
- **Not real enhancement:** AI upscaling or "AI 4K" invents pixels. Never run it on the evidence itself.

## AI illustrations (match the file, not a guess)

The goal is to make viewers feel "what if this showed up in front of us", in a realistic style that resembles the file. **Shape comes from the footage, colour and light from the documents.** A text-only prompt invents its own shape, so don't use one. Real case: `showcase/DOW-UAP-PR116.py` (its docstring has the prompts).

1. **Shape:** start from the enhanced close-up, crop it square and threshold it to a silhouette. Fill only the enclosed holes with a flood fill. Morphological closing also fills the gaps between lobes, so don't use it.
2. **Rough colour version:** tint the silhouette using the file's colour words, with the IR shading kept. Turn bright IR spots silver if the form ticks Metallic or Reflective. Overlay it on an empty `flux-1-schnell` background of the scene (sky, sea, jet nose).
3. **Make it real:** run `@cf/black-forest-labs/flux-2-dev` with the rough version as `input_image_0`. Send it as a multipart form, `-F input_image_0=@x.png`, 512² input, `steps=25`. Prompt: "turn image 0 into a photorealistic photograph… keep the EXACT silhouette, outline, notches, lobes, size, position and colour; only add material and light".
4. **Light it like the file:** run one "keep EVERYTHING identical, change ONLY the lighting" pass per issue, with the previous output as input. Use the time of day (Dusk = backlit, rim light from the horizon), Opaque (no light through) and Metallic/Reflective (crisp glints of sky and horizon). If it comes out too dark, add an "exposure only" pass so the colour the crew saw stays visible.
5. **Check:** compare it side by side with the IR still. If you pile material words into one prompt, the model invents a new object (in one test it made a clear ball). Change one thing per pass.
6. **Label and save:** on screen, put "AI render of the IR shape + crew's colour, not evidence". Use the image only behind quotes, never as footage. Commit `<ID>-ai.jpg` and put the prompts in the docstring, because flux has no seed.

## Craft

- On-screen text sits in the safe zone (y 200–1470). Use `lib.txt`: it's centred, outlined and shrinks to fit. No emoji in drawtext.
- Use yellow for the thing to look at (boxes, frame counters, the sound bite) and white for everything else.
- Each text card has ≤6 words per line and two lines max.
- Use the stored black-bar crop. 1080x1920, 30 fps.

## Before showing the user

1. Pull frame 0 out of the render and **look at it**: would you tap it? Then pull one frame from the middle of each beat (`-ss <t> -i out.mp4 -frames:v 1`, seeking by time rather than `select`) and check the text, boxes, subtitles and the ID line.
2. Check duration, check there's an audio stream, and check per-second loudness **in the voice band** (`highpass=f=300` first; the drone hides a missing voice in plain RMS). Every narration cue should show up, and the voice should stay quiet at the key moment. Mix the audio in its own ffmpeg step, then burn the subtitles in a second step: putting both in one graph silently dropped PR116's late lines.
3. Commit the recipe (the mp4 is git-ignored) and send the mp4 with SendUserFile.
4. **Never post until the user approves** ("no post until we make it good"). Posting a showcase Short uses `scripts/publish.sh --showcase` (publish skill), once per record. An already-posted record's re-cut goes to R2 under a new key (`<ID>-v2.mp4`), because the old key is edge-cached for 1 month.
5. **Uploading a version** (when the user asks): never overwrite. Use the next `-vN` key (a GET on `https://assets.realufo.org/<key>` should return 404 first), then run `npx wrangler r2 object put "realufo/<key>" --file <mp4> --content-type video/mp4 --cache-control "public, max-age=2592000" --remote --env-file /dev/null`. Confirm a GET returns 200 with the same byte size as the local file. Record the key and what changed in that version in the `realufo-showcase-shorts` memory.

## Common misses

| Miss | Fix |
|---|---|
| Pure mystery: nothing learnt | Add the lesson beat: why it looks like that, or how to check it. |
| Narrating over the money shot | Move lines before and after it. |
| Frame 0 gives away the answer (zoomed object) | Nothing left to wait for. Tease instead: box the spot, add a "?" and a challenge, and save the close-up for the reveal. |
| Weak frame 0 (dark, cluttered, no text) | Bold 2-line challenge headline, yellow box, high contrast. |
| Event buried 10 s in | Start the clip about 3 s before the moment. |
| Big claims, no source | Cut the claim, or cite the page. |
| One long held shot | Change something every 2–3 s: speed, zoom, frame step or text. |
| Facts only in the voice | Put the key words on screen too, since most viewers are muted. |
| Ends on a dead card | End on the frame-0 image so the loop is seamless. |
| Two or three calls to action | Keep one: realufo.org/doc/<ID>. |
