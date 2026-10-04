# 茶盤 Chaban — the RealUFO design style

> A tea tray holds a few tools. Each has its place, each is shaped for its use, and you use them calmly. That is how RealUFO's interface should feel.

**Chaban** (茶盤, "tea tray") is the design style for realufo.org's interface. It joins four ideas: **form follows function** (Bauhaus, Max Bill), **design like a real object** (Braun, Walkman, iPod), **間 ma and the calm of tea culture and zen**, and **warmth for the person using it**.

## 繁中總結

- **形隨機能**：圓形 = 轉（轉盤、旋鈕），方形 = 撳（按鍵、打擊墊），長條 = 推／拉（推桿、進度條），三角形只用嚟播放。
- **好似設計真實物件**：形狀、大小、比例都由用途決定。最常用嘅最大、最近手指。開咗嘅掣會陷落同發亮，好似真嘅掣。
- **極簡、包浩斯**：元素少、嚴格網格、平面、黑白灰加一隻強調色。冇裝飾，除非佢幫到人用。
- **間、茶道、禪**：留白都係設計嘅一部分。動作平靜（120–200ms），每樣嘢都小心擺好位。
- **有溫度、由用家出發**：回饋溫柔，所有改動都可以一下還原。舒適比比例重要（手機最少 36px）。第一次用唔使睇說明都識。
- **自己解釋自己、響應式**：一睇形狀就知做咩，由 320px 手機到大螢幕都用得。
- **參考**：Junghans max bill 錶面（幼刻度、幼指針、大量留白）、Apple、日式設計、Braun／Dieter Rams、Walkman、iPod。

## The eight principles

1. **Form follows function.** A control's shape tells you what it does before any word does.
2. **A real object.** Design each control as if it will be held: its form, its size, its weight on the page.
3. **Less, but better.** Few elements, each earning its place. Remove anything that is only decoration.
4. **間 Ma.** Empty space is part of the design. Sections breathe; nothing is crammed.
5. **Calm.** Motion is quiet and short. Colour is quiet. One accent says "on".
6. **Warm.** Gentle feedback, forgiving undo, friendly plain words. Minimal must never feel cold.
7. **From the user's side.** Comfort beats proportion. Most-used is biggest and nearest the thumb. A first-timer understands without help.
8. **Self-explaining and responsive.** Works and explains itself from a 320px phone to a wide desktop.

## Form vocabulary

| Shape | Means | Examples |
|---|---|---|
| ○ Round | Turn (continuous or stepped) | click wheel, magnifier knob |
| □ Square | Press (toggle, hold, action) | keys, pads, icon chips |
| ▭ Long | Slide (a range) | faders, seek bar, sliders |
| △ Triangle | Play | play button only |

- **Round controls are drawn like the Junghans max bill dial:** a quiet face, hairline ticks at each step, one thin needle for the value, the value small in the middle, a wide empty margin, no numerals round the edge.
- **State is physical:**
  - Off = raised: a thicker bottom edge.
  - On = sunk 2px and lit in the accent colour.
  - Momentary controls (hold to see the original) sink only while held, and show a dashed edge.

## Size and touch

- **Size follows use:** the most-used control is the largest (the click wheel, then effects, then rarely used tools).
- **Touch targets:** at least **36×36px on touch**, **32×32px with a mouse**. WCAG 2.2's 24px is the floor, never the goal. Never shrink a key to keep a proportion; grow the object instead.
- **Icon size:** 18px in 36px controls, 16px in 32px, 20px on large pads.
- **One 8px grid.** Corner radius per shape family:
  - Squares: 8px
  - Bodies and panels: 16px
  - Round controls: full circle

## Colour

- The body uses the site's black, white and greys (`bg`, `bg2`, `surface`, `line`, `line2`, `ink`, `dim`, `faint`).
- **One accent, `--signal`, means "on".** **Amber** appears only for "failed, try again".
- No gradients, glows, textures or shadows for depth. Physical state comes from edges and position.
- Both themes (light and dark) must read well.

## Motion

- 120–200ms ease-out. No bounce, no overshoot.
- Motion only where it carries meaning, for example a key sinking or cassette reels turning while a video plays.
- Everything stops under `prefers-reduced-motion`.
- Haptics: a 5ms tick per step on phones that support it, nothing more.

## Words

- **Controls are icon-only;** the words go in `aria-label`, `title`, and the help panel.
- Plain words for what the visitor sees or gets ("Bring out detail in dark night footage"), never how it works ("gamma curve").
- Sentence case, short, friendly, no jargon, no "please", no exclamation marks.
- **The only words that appear unasked** are a one-line first-time hint, closed for good with ✕.

## Behaviour

- **Forgiving:** every change can be undone in one tap. Undo looks, full view, reset order and reset presets are always near.
- **What is on is visible:** anything active shows in the always-visible strip, and one tap there turns it off.
- **Remembered, not demanded:** the visitor's choices (style, order, presets) are kept on their device. Nothing asks them to sign in for it.
- **Respect gestures:** don't hijack scroll, hold or drag outside an explicit mode (for example arrange mode).

## Layout

- Group by what the visitor wants to do, not by how the code is built.
- Phones stack sections, with the most used first. Wide screens put sections side by side.
- No horizontal scroll at 320px.
- One always-visible strip; deeper tools live one tap away in a console that remembers whether it was open.

## References

- **Junghans max bill automatic 38mm:** the model for round controls and restraint.
- **Bauhaus / Max Bill:** form follows function, strict grid.
- **Braun / Dieter Rams:** "less, but better", the object as honest tool.
- **Sony Walkman, Apple iPod:** physical, pocketable, a click wheel under the thumb.
- **Japanese design, tea culture, zen:** 間 ma, calm, each thing placed with care.
- **Apple:** clarity, deference to content, depth through hierarchy rather than decoration.

## Checklist (use before shipping any visitor-facing UI)

- [ ] Does each control's shape say what it does (round turns, square presses, long slides)?
- [ ] Is the most-used control the biggest and closest to the thumb?
- [ ] Are all touch targets ≥ 36px on a 375px phone and ≥ 32px with a mouse?
- [ ] Is there one accent for "on" and nothing decorative that doesn't help use?
- [ ] Does "on" look physically different (sunk, lit) from "off"?
- [ ] Can every change be undone in one tap?
- [ ] Would a first-timer understand it without opening help?
- [ ] Are labels and help in plain words, icon-only controls labelled with `aria-label` + `title`?
- [ ] Does it work at 320px with no horizontal scroll, and in both themes?
- [ ] Is motion calm (≤ 200ms) and off under reduced motion?

First applied in: the media console (`docs/superpowers/specs/2026-10-04-media-dj-console-design.md`).
