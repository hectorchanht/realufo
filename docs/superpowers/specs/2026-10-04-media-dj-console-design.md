# Media DJ console — design

Date: 2026-10-04 · Status: approved direction, spec under review

## Goal

The Doc media tools (image + video) grew to ~20 equal-weight chips across two rows. Visitors can't tell what matters. Rebuild them as a **DJ console**: a short strip that is always there, and a console that opens with faders, pads, a deck (jog wheel) and four **preset slots** that apply a whole setup in one tap. Layout choices and presets are remembered on the device.

Constraints carried over: icon-only controls with `aria-label` + `title` (memory: icons-less-text), plain-word help panel (memory: user-friendly-ui), tap targets 36px on touch / 32px with a mouse, all filter/lens URL params unchanged (`br ct sat gam inv bw pal sharp lens mag`, share links keep working).

## Layout

### Playback row (video only, always visible, above the strip)
Seek bar · play/pause · ‹ › frame step · timecode · mute · full screen. (Moves out: download, capture, post frame → tool pads; moment link → strip link; speed/loop/A–B → deck.)

### Strip (always visible)
`[zoom −][zoom +][magnifier] | [P1][P2][P3][P4] [console] ……… [link][?]`
- **P1–P4**: tap = apply preset; lit when the current setup equals it.
- **Console** (`SlidersHorizontal`): opens/closes the console (remembered, replaces `ru:adjust-open`).
- **Save** (floppy) appears after P4 while the console is open (see Presets).
- **Status chips** appear only while something is on, one tap turns it off: zoom `2.3× ✕`, ruler ✕, motion ✕, and `eye` (hold for original) + `undo looks` while any look is applied. With the console closed this is how a visitor sees and clears what is active.
- **Link**: image → copy view link; video → copy moment link (with view + looks), as today.

### Console (opens under the strip)
Three sections, side by side ≥ 900px, stacked on phones (the click wheel first on phones, it is the most used):
1. **Faders** — brightness, contrast, colour, shadows as vertical sliders (`<input type=range>` with `writing-mode: vertical-lr`, native and accessible). Double-click / double-tap a fader = back to 100.
2. **Pads** — 4-column grid of square pads (44px), lit when on.
   - Effect pads: Enhance, Invert, B&W, Night, Ironbow, Rainbow, Sharpen, **Original** (momentary: shows the unfiltered file while held; dashed border).
   - Tool pads: Ruler, Motion (video), Turn, Save picture / Save frame, Post frame (video), Download video (video).
3. **Deck**
   - **Click wheel** (iPod style, ≈132px): a ring you slide a finger or the mouse around, four press points on the ring and a centre button.
     - Ring: video → scrub, 1 frame per 12° (pauses playback), timecode in the centre; image → zoom, `zoom ×= exp(Δ°/180)` around the centre.
     - Press points and centre:

       | | Video | Image |
       |---|---|---|
       | Centre | play / pause | full view (undo zoom) |
       | Left / right | previous / next frame | zoom out / in |
       | Top | speed (cycles 0.25, 0.5, 1, 2×) | magnifier on/off |
       | Bottom | A–B loop (start, end, clear) | turn |
     - A tap that doesn't slide counts as a press; a slide of more than 6° is a scrub. A little tick sound is not played (silent site); a short `navigator.vibrate(5)` per frame step on phones that support it.
     - `role="slider"` on the ring (arrow keys = one step, `aria-valuetext` = timecode or zoom); the five press points are real buttons with `aria-label` + `title`.
     - Video only, next to the wheel: loop (whole clip) toggle; the speed shows as a small `0.5×` readout under the wheel.
   - **Magnifier knob**: 2× / 3× / 5× / 8×; drag up/down or tap to step; `role="slider"` with `aria-valuetext`.

**Mirror (flip)** loses its button; the `F` key and `?flip=1` share links keep working. It leaves the help panel.

### Arrange mode
A pencil button in the console header turns on arrange mode: pads get a dashed outline and can be dragged to a new place within their grid (pointer events, mouse and touch; no new dependency). Buttons: done · reset order · reset presets. Pads are not draggable outside arrange mode (on phones, hold = Original pad and drag = pan).

## Presets

```ts
interface Preset { slot: 1 | 2 | 3 | 4; name: string; adjust: ImageAdjust; mag: number; motion: boolean }
```
A preset stores the **look** (`ImageAdjust`), **magnifier strength** and **Motion on/off**. Not zoom, pan or turn: those belong to one picture.

Defaults:
| Slot | Name | Setup |
|---|---|---|
| P1 | Clean | default look, 3×, motion off |
| P2 | Night hunt | Night (gamma 170, contrast 110) + Sharpen, 5× |
| P3 | Thermal | Ironbow + contrast 120, 3× |
| P4 | Motion | default look, 3×, motion on |

- **Apply**: look → URL params (existing `setAdjust`), mag → `setMag`, motion → `toggleMotion` (videos only; ignored on images).
- **Save**: tap the floppy → slots pulse → tap a slot → current setup stored there, toast "Saved to P2". Saved slots are named "Your setup". Arrange mode has a "reset presets" button next to "reset order" that restores the four defaults.
- **Lit slot**: `adjustFilter`, mag and motion equal the preset's.

## Storage (this device only, `localStorage`, try/catch, bad JSON → defaults)
- `ru:media-presets` — `{ v: 1, presets: Preset[] }`
- `ru:media-pads` — `{ v: 1, effects: PadId[], tools: PadId[] }`; unknown ids dropped, missing ids appended (new pads appear after an update).
- `ru:console-open` — `"1" | "0"`

No cross-device sync (out of scope; could later ride on the anonymous ID).

## Code shape
- `web/src/lib/mediaPresets.ts` — Preset type, defaults, load/save, `matches()`; pure, unit tested.
- `web/src/lib/padOrder.ts` — load/save/move/reset of pad order; pure, unit tested.
- `web/src/lib/useVideoTransport.ts` — the video state now inside `VideoTransport` (play, rate, loop, A–B, mute, full screen, capture, post, download) lifted into a hook, so the playback row and the console both drive one state. Replaces the `speedSlot` portal.
- `web/src/components/console/` — `MediaConsole.tsx` (strip + console), `Fader.tsx`, `PadGrid.tsx` (incl. arrange mode), `ClickWheel.tsx`, `Knob.tsx`.
- `ImageTools.tsx` keeps filters, lens, minimap, `renderPng`; `MediaToolbar` is replaced by `MediaConsole`.
- `VideoTools.tsx` keeps `VideoTransport` as the playback row only (built on the hook), `VideoLens`, `KeyMoments`.
- `MediaHelp.tsx` regrouped to match the console (strip, presets, faders, pads, deck); flip row removed.
- Keyboard shortcuts unchanged; new: `1`–`4` apply presets.

## Testing
- Unit: presets (defaults, round trip, corrupt storage, `matches`, motion ignored on images), pad order (move, unknown/missing ids, reset).
- Doc tests: strip contents image vs video; console toggle remembered; preset apply sets URL params; save to slot persists; fader sets brightness; effect pad toggles; Original pad momentary; click-wheel ring arrow keys step a frame (video) / zoom (image), press points (centre play/pause, left/right frame, top speed, bottom A–B; image: full view, zoom out/in, magnifier, turn), tap vs slide threshold; knob changes mag; no Flip button but `F` flips; `1`–`4` keys; arrange mode reorders and persists.
- Browser: phone 375px and desktop, image + video, slide round the click wheel (mouse + touch emulation), arrange-mode drag with mouse and touch emulation, tap sizes ≥ 36/32px.

## Out of scope
Naming presets, more than 4 slots, adding/removing pads, cross-device sync, MIDI controllers.
