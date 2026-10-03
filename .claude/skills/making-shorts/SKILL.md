---
name: making-shorts
description: Use when making, re-cutting, narrating or reviewing a vertical 9:16 Short (YouTube Shorts, TikTok, Instagram Reels, X video) about a RealUFO record or article: showcase/<ID>.py recipes, showcase/articles/<slug>/short.py, scripts/clips.py cuts.
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
- Write one short line per beat, spoken like a friend showing you something ("Did you catch it?"), not a press release. Spell out what the voice mangles: "real U F O dot org", "two hundred eighty-nine".
- Keep the voice **off** the key moment so the blink, split or pass plays clean.
- For fixed-length footage, measure each line with `lib.tts` first, place it at a cue and mix with `adelay`. See `showcase/AARO-956955.py`. Built from stills: `Cut.seg(..., say=line)` stretches each beat to fit.

## Craft

- On-screen text sits in the safe zone (y 200–1470). Use `lib.txt`: it's centred, outlined and shrinks to fit. No emoji in drawtext.
- Use yellow for the thing to look at (boxes, frame counters, the sound bite) and white for everything else.
- Each text card has ≤6 words per line and two lines max.
- Use the stored black-bar crop. 1080x1920, 30 fps.

## Before showing the user

1. Pull frame 0 out of the render and **look at it**: would you tap it?
2. Check duration, check there's an audio stream, and check per-second loudness. The voice should sit about 3 dB over the bed and stay quiet at the key moment.
3. Commit the recipe (the mp4 is git-ignored) and send the mp4 with SendUserFile.
4. **Never post until the user approves** ("no post until we make it good"). Posting a showcase Short uses `scripts/publish.sh --showcase` (publish skill), once per record. An already-posted record's re-cut goes to R2 under a new key (`<ID>-v2.mp4`), because the old key is edge-cached for 1 month.

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
