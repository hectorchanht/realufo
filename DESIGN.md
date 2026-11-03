---
name: RealUFO
description: Declassified UAP/UFO archive — a dark records room laid out like a tea tray.
colors:
  bg: "#07080c"
  bg2: "#0b0d13"
  surface: "#111420"
  surface2: "#161a28"
  elev: "#1b2030"
  line: "rgba(150, 170, 205, 0.12)"
  line2: "rgba(150, 170, 205, 0.24)"
  ink: "#e7ecf4"
  dim: "#a1abbd"
  faint: "#7a8598"
  signal: "#4df0a6"
  signal-dim: "rgba(77, 240, 166, 0.14)"
  on-signal: "#04140c"
  cyan: "#46dfff"
  amber: "#ffb648"
  red: "#ff5d57"
  violet: "#b39bff"
  light-bg: "#e9e5d9"
  light-surface: "#fbf9f1"
  light-ink: "#161a21"
  light-signal: "#00673e"
typography:
  wordmark:
    fontFamily: "'Press Start 2P', monospace"
    fontSize: "11px"
    lineHeight: 1.15
  title:
    fontFamily: "'Space Grotesk', system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "'Space Grotesk', system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'JetBrains Mono', monospace"
    fontSize: "10px"
    fontWeight: 500
    letterSpacing: "0.5px"
  meta:
    fontFamily: "'JetBrains Mono', monospace"
    fontSize: "9px"
    letterSpacing: "0.4px"
rounded:
  chip: "7px"
  key: "11px"
  field: "12px"
  card: "14px"
  panel: "16px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.on-signal}"
    rounded: "{rounded.key}"
    padding: "11px 16px"
    typography: "{typography.label}"
  nav-tab-active:
    backgroundColor: "{colors.signal-dim}"
    textColor: "{colors.signal}"
    rounded: "{rounded.key}"
    height: "44px"
  nav-tab:
    textColor: "{colors.dim}"
    rounded: "{rounded.key}"
    height: "44px"
  chip-tag:
    textColor: "{colors.dim}"
    rounded: "{rounded.chip}"
    padding: "4px 9px"
    typography: "{typography.label}"
  card-record:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
  input-search:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "10px 13px"
---

# Design System: RealUFO

## Overview

**Creative North Star: "The Declassified Tea Tray"**

A dark records room, lit by one phosphor-green lamp, where every tool sits on a tray in its own place. The room comes from the original CRT prototype: near-black blue surfaces, faint film grain, optional scanlines, a pixel wordmark and monospaced labels that read like stamped file headers. The tray is 茶盤 ちゃばん (`docs/design/chaban-design-style.md`): few controls, each shaped for its use, quiet motion, one accent that means "on".

The two layers have different jobs. The CRT layer is atmosphere and brand texture; it lives in the background, the wordmark and the type of metadata. The tea-tray layer governs everything a hand touches: controls, colour meaning, motion and words. When they disagree on a control, the tea tray wins. The evidence (scans, video frames, page text) is always the brightest, largest thing on screen; chrome steps back.

Density is high on purpose (archives are lists), but rows breathe: small mono metadata, generous card gaps, nothing decorative that doesn't help someone find or check a file.

**Key Characteristics:**
- Dark first; a warm paper light theme with AA-tuned text colours.
- One accent (`signal`, phosphor green by default; visitor can pick cyan, amber or violet) means on, active, primary.
- Mono for metadata and labels, grotesk for titles and reading, pixel only for the wordmark and page titles.
- Icon-only controls (lucide), words in `aria-label`/`title`.
- Flat surfaces separated by hairline borders, not shadows.

## Colors

A near-black blue room with cool grey text and one phosphor lamp; data accents tint sources and boards.

### Primary
- **Phosphor Signal** (`signal`): the "on" colour. Active tab, primary button, focused/selected state, links on hover, the UFO half of the wordmark. Its dim twin (`signal-dim`) fills active tabs and text selection. Visitor-switchable to cyan / amber / violet via `[data-accent]`; in light theme it becomes Deep Moss (`light-signal`).

### Secondary
- **Archive Cyan** (`cyan`): default link colour and a data accent for sources.
- **Amber Warning** (`amber`): "failed, try again" only, plus data accents.
- **Redaction Red** (`red`): the redacted chip, destructive confirmations.
- **Report Violet** (`violet`): data accent only.

Data accents pass through `dataInk()` (`--data-mix`: 100% dark, 45% mixed with ink in light) so they keep ≥4.5:1 on the light background.

### Neutral
- **Vault Black** (`bg`), **Shelf Black** (`bg2`): page and bar backgrounds.
- **Folder Slate** (`surface`), **Raised Slate** (`surface2`), **Lamp Slate** (`elev`): cards, fields, popovers, in that order of height.
- **Hairline** (`line`), **Hairline Strong** (`line2`): every border and divider; `line2` on hover and on fields.
- **Paper White** (`ink`), **Dust Grey** (`dim`), **Ash Grey** (`faint`): primary text, secondary text, metadata/placeholder.
- Light theme mirrors each role: Archive Paper (`light-bg`), Index Card (`light-surface`), Carbon Ink (`light-ink`); full set in `web/src/theme/theme.css`.

### Named Rules
**The One Lamp Rule.** Only `signal` means "on". Never use it for decoration, headings or illustration.
**The Amber Means Trouble Rule.** Amber in UI chrome only ever means "failed, try again".
**The Two Themes Rule.** Every colour pair must read in both themes; light text colours are AA-tuned (≥4.5:1 on `bg`), never reuse dark-theme hexes in light.

## Typography

**Display Font:** Press Start 2P (with monospace)
**Body Font:** Space Grotesk (with system-ui, sans-serif)
**Label/Mono Font:** JetBrains Mono (with monospace)

**Character:** A stamped file header (mono), a readable modern grotesk for what people actually read, and an 8-bit wordmark as the single nod to the CRT room.

### Hierarchy
- **Wordmark / page title** (Press Start 2P, 10–11px): `REAL<signal>UFO</signal>` and desktop nav page titles only.
- **Title** (Space Grotesk 600, 12.5–13px, 1.3): card and row titles, clamped to 3 lines.
- **Body** (Space Grotesk 400, 13.5–15px, ~1.5): summaries, page text, threads; keep reading columns ≤680px.
- **Label** (JetBrains Mono 500–700, 10–13px, 0.5px tracking): buttons, chips, active tab labels, counts.
- **Meta** (JetBrains Mono, 8.5–9.5px, 0.3–0.4px tracking, `faint`): record IDs, dates, agency lines.

Sizes are authored in px and converted to rem by PostCSS so the text sizer (50–300%, `html` font-size) scales everything.

### Named Rules
**The Stamp Rule.** Anything that is metadata (ID, date, agency, count) is mono; anything that is meant to be read is grotesk.
**The One Pixel Voice Rule.** Press Start 2P is for the wordmark and page titles; never for body, buttons or long labels.

## Layout

- Phone-first app shell. Below 900px: top AppBar, content with 16px side gutter, bottom tab bar (4 icon tabs + More) that hides on scroll and floats over content with a 78% `bg` blur. At ≥900px: a single top nav bar (`bg2`, hairline bottom) with icon tabs, wordmark and page context; no bottom bar.
- Grids of record cards use dense packing; portrait media cards span two rows.
- Spacing sits on an 8px grid with 4px half-steps; many legacy values are odd px (7, 9, 11, 13) from the prototype — match neighbours rather than normalising one place.
- Reading width caps around 560–680px; dialogs at 360px.
- Must work from 320px to wide desktop with no horizontal page scroll; horizontal chip rows scroll with hidden scrollbars (`[data-scroll]`).

## Elevation & Depth

Flat. Depth comes from the neutral ladder (`bg` → `surface` → `surface2` → `elev`) and hairline borders, plus position for pressed state. The one theme shadow (`--shadow`) and a few one-offs belong to floating overlays (sheets, popovers, media viewer) where something genuinely sits above the page.

### Shadow Vocabulary
- **Overlay lift** (`box-shadow: 0 18px 50px -16px rgba(0,0,0,0.72)`; light: `0 18px 50px -18px rgba(50,60,80,0.28)`): sheets, popovers, menus.
- **Scrim** (`box-shadow: 0 0 0 999px rgba(0,0,0,0.35)`): spotlight behind a focused overlay.

### Named Rules
**The Flat Tray Rule.** Cards and controls never cast shadows. If something needs to look raised, use a thicker bottom edge; if pressed, sink it 2px and light it.

## Shapes

Gently rounded rectangles by family: chips 7px, keys and tabs 11px, fields 12px, cards 14–15px, panels and sheets 16px, round controls fully circular. Following 茶盤: round = turn (dials, knobs), square = press (keys, chips, pads), long = slide (seek bars, faders), triangle = play only. Hairline 1px borders everywhere; a 2px border only on media placeholders. Thumbnails are cropped to fill (`object-cover`) with a slight contrast lift.

## Components

Tactile and quiet: like real keys on a desk. Off is flat and calm; on sinks and lights in the accent; nothing bounces.

### Buttons
- **Shape:** key radius (11px); compact inline actions use 6–8px.
- **Primary:** `signal` fill, `on-signal` text, mono bold 12px with 0.5px tracking, ~11px × 16–22px padding.
- **Press:** scales to .96–.97 on `:active`; disabled = 60% opacity, no pointer.
- **Outline / ghost:** pill with `signal` border and text, fills on hover (filter "apply"-style actions); plain icon buttons are 36×36 (touch) / 32×32 (mouse) with 18px / 16px lucide icons.

### Chips
- **Style:** the shared `.tag` class: 7px radius, `line2` border, mono 10px `dim` text, 4×9px padding.
- **State:** hover turns border and text `signal`. Active filter chips use `signal-dim` fill with `signal` text. Image badges on cards are 5px-radius dark (`rgba(0,0,0,.85)`) stamps with mono 8–9px bold text; the redacted badge is `red` with white text.

### Cards / Containers
- **Corner Style:** 14px (grid), 15px (feed).
- **Background:** `surface`, media area on `bg2` with a hairline under it.
- **Shadow Strategy:** none (Flat Tray Rule).
- **Border:** `line`, `line2` on hover; press scales to .985.
- **Internal Padding:** ~11–12px; meta line (mono 9px `faint`), source line in its data accent, title, optional italic one-liner in `dim`.

### Inputs / Fields
- **Style:** 12px radius, `surface` fill, `line2` border, mono 12.5px `ink` text, `faint` placeholder, leading search glyph.
- **Focus:** border moves to `signal`; no glow.

### Navigation
- **Phone bottom tab:** 4 icon tabs + More, min 44px tall, icons `dim`; active tab is `signal` and shows its mono 9px label, others keep the label `sr-only`. Re-tap scrolls to top.
- **Desktop top nav:** 44px icon tabs with 11px radius; active = `signal-dim` fill + `signal` icon + visible label; hover = `surface`.

### Video / image tools (signature)
The 茶盤 control set on record pages: round dials for scrub and zoom (drawn like the Junghans max bill face: hairline ticks, one thin needle, value small in the centre), square keys for frame step and effects, long faders for speed and seek, triangle for play. Active effects sit in an always-visible strip, one tap to turn off.

## Do's and Don'ts

### Do:
- **Do** read `docs/design/chaban-design-style.md` before touching any visitor-facing control.
- **Do** use theme tokens (`bg`…`signal`) via Tailwind names or `var(--…)`; never raw hexes in components.
- **Do** keep touch targets ≥36×36px (nav 44px) and icons 18px in 36px controls.
- **Do** write metadata in mono and reading text in grotesk (Stamp Rule).
- **Do** keep motion 120–200ms ease-out (sheets may use the 300ms `cubic-bezier(.32,.72,0,1)` slide) and stop it under `prefers-reduced-motion`.
- **Do** run colour pairs through `dataInk()` for data accents so light theme stays ≥4.5:1.

### Don't:
- **Don't** use `signal` for decoration, headings or illustration (One Lamp Rule).
- **Don't** add shadows, glows or gradients to cards and controls; gradients are allowed only as a legibility scrim over media.
- **Don't** add new grain, scanline or pixel-font surfaces beyond the existing CRT layer; the room is set, the tray is where new work goes.
- **Don't** put visible text on controls; words go in `aria-label`, `title` and help.
- **Don't** let chrome outshine the evidence: scans and frames stay the largest, brightest element.
