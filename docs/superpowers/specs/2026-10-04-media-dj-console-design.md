# Media DJ console — design

Date: 2026-10-04 · Status: approved direction, spec under review

## Goal

The Doc media tools (image + video) grew to ~20 equal-weight chips across two rows. Visitors can't tell what matters. Rebuild them as a **DJ console**: a short strip that is always there, and a console that opens with faders, pads, a deck (iPod-style click wheel) and four **preset slots** that apply a whole setup in one tap. Layout choices and presets are remembered on the device.

Constraints carried over: icon-only controls with `aria-label` + `title` (memory: icons-less-text), plain-word help panel (memory: user-friendly-ui), tap targets 36px on touch / 32px with a mouse, all filter/lens URL params unchanged (`br ct sat gam inv bw pal sharp lens mag`, share links keep working).

## Console styles (the visitor picks)

The same controls come in three looks. The visitor picks one; it is remembered on the device (`ru:media-skin`). Every style has the same strip, the same functions, keys and presets: only the console body differs.

| Style | Console body |
|---|---|
| **Simple** (default for new visitors) | Today's panel, tidied: effect chips, tool chips, horizontal sliders, magnifier strength chips, video speed / loop / A–B chips. |
| **DJ deck** | Faders · square pads (effects, tools) · deck with the click wheel and the magnifier knob. |
| **Walkman** | Walkman body: cassette window, faders, the Wakeman keyboard (white keys = effects, black keys = tools), the click wheel and the magnifier knob. |

- **Picker**: a `Palette` button in the console header opens a small menu: three rows, icon + name, the current one ticked. Picking switches at once (console stays open).
- Arrange mode, pad order and presets are shared by all three styles (one order for effects, one for tools).
- Default for a first visit is Simple, so new visitors meet the plainest one; the help panel mentions the other two.

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

### Console body parts (used by the DJ deck and Walkman styles; Simple uses chips and horizontal sliders)
Three sections, side by side ≥ 900px, stacked on phones (the click wheel first on phones, it is the most used):
1. **Faders** — brightness, contrast, colour, shadows as vertical sliders (`<input type=range>` with `writing-mode: vertical-lr`, native and accessible). Double-click / double-tap a fader = back to 100.
2. **Pads** — drawn as the keyboard (see Look and feel); lit/pressed when on.
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

### Walkman style: Walkman body, Wakeman keys
The console is drawn as a retro **Walkman** with a **Rick Wakeman** keyboard rig inside. Flat surfaces, site colour tokens only (no gradients/glow), works in both themes.
- **Body**: a rounded chassis panel with a coloured stripe along the top edge (site accent) and the preset buttons P1–P4 styled as the Walkman's chunky hardware buttons.
- **Cassette window** (top of the console): a small display that shows what is going on: timecode (video) or zoom (image), the active preset name, and the speed. Two cassette reels sit either side and turn while the video plays (CSS rotation; still under `prefers-reduced-motion`, still for images).
- **Keyboard** (replaces the pad grid): one keyboard row, the Wakeman part.
  - White keys = effects: Enhance, Invert, B&W, Night, Ironbow, Rainbow, Sharpen, Original (Original is held, like holding a note).
  - Black keys = tools, sitting between the white keys: Ruler, Motion (video), Turn, Save, Post frame (video), Download (video).
  - A key that is on stays pressed down (inset, accent colour); icons on the keys, names in `title` / `aria-label`.
  - Phone (375px): 8 white keys ≈ 42px wide × 64px tall, black keys ≈ 30 × 40px: both above the 36px / WCAG 24px targets.
- **Faders**: synth-style vertical sliders (Minimoog feel) beside the keyboard on desktop, above it on phones.
- **Click wheel** (iPod) sits on the right of the body like the Walkman's control dial; first under the cassette window on phones.

### Arrange mode
A pencil button in the console header turns on arrange mode: keys get a dashed outline and can be dragged to a new place within their row (white keys among white keys, black among black) (pointer events, mouse and touch; no new dependency). Buttons: done · reset order · reset presets. Pads are not draggable outside arrange mode (on phones, hold = Original pad and drag = pan).

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
- `ru:media-skin` — `"simple" | "dj" | "walkman"`; anything else → `"simple"`

No cross-device sync (out of scope; could later ride on the anonymous ID).

## Code shape
- `web/src/lib/mediaPresets.ts` — Preset type, defaults, load/save, `matches()`; pure, unit tested.
- `web/src/lib/padOrder.ts` — load/save/move/reset of pad order; pure, unit tested.
- `web/src/lib/useVideoTransport.ts` — the video state now inside `VideoTransport` (play, rate, loop, A–B, mute, full screen, capture, post, download) lifted into a hook, so the playback row and the console both drive one state. Replaces the `speedSlot` portal.
- `web/src/components/console/` — `MediaConsole.tsx` (strip + skin picker + the chosen body), `SimpleBody.tsx`, `DjBody.tsx`, `WalkmanBody.tsx`, `PadGrid.tsx`, `Fader.tsx`, `Keyboard.tsx` (white/black keys, incl. arrange mode), `CassetteWindow.tsx`, `ClickWheel.tsx`, `Knob.tsx`.
- `ImageTools.tsx` keeps filters, lens, minimap, `renderPng`; `MediaToolbar` is replaced by `MediaConsole`.
- `VideoTools.tsx` keeps `VideoTransport` as the playback row only (built on the hook), `VideoLens`, `KeyMoments`.
- `MediaHelp.tsx` regrouped to match the console (strip, presets, faders, pads, deck); flip row removed.
- Keyboard shortcuts unchanged; new: `1`–`4` apply presets.

## Testing
- Unit: presets (defaults, round trip, corrupt storage, `matches`, motion ignored on images), pad order (move, unknown/missing ids, reset).
- Doc tests: skin picker switches body and is remembered, each style's controls drive the same state; strip contents image vs video; console toggle remembered; preset apply sets URL params; save to slot persists; fader sets brightness; effect pad toggles; Original pad momentary; click-wheel ring arrow keys step a frame (video) / zoom (image), press points (centre play/pause, left/right frame, top speed, bottom A–B; image: full view, zoom out/in, magnifier, turn), tap vs slide threshold; knob changes mag; no Flip button but `F` flips; `1`–`4` keys; arrange mode reorders and persists.
- Browser: each of the three styles × phone 375px and desktop × image and video, slide round the click wheel (mouse + touch emulation), arrange-mode drag with mouse and touch emulation, tap sizes ≥ 36/32px.

## Out of scope
Naming presets, more than 4 slots, adding/removing pads, cross-device sync, MIDI controllers.
