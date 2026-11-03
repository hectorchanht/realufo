---
name: RealUFO
description: Declassified UAP/UFO archive on a phosphor CRT terminal.
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
  2xs: "2px"
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  lg-plus: "20px"
  xl: "24px"
  2xl: "32px"
  3xl: "48px"
  4xl: "64px"
components:
  button-primary:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.on-signal}"
    rounded: "{rounded.key}"
    padding: "12px 16px"
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
    padding: "4px 8px"
    typography: "{typography.label}"
  card-record:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
  input-search:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "8px 12px"
---

# Design System: RealUFO

## Overview

**Creative North Star: "The Declassified CRT Terminal"**

CRT is the design style of RealUFO. The site is a records terminal glowing in a dark room: near-black blue glass, phosphor-green signal, film grain over everything, scanlines drifting across the screen, a pixel wordmark, and monospaced labels that read like stamped file headers and teletype readouts. The authoritative source is the original prototype, `realufo-handoff/RealUFO.dc.html`, ported verbatim into `web/src/theme/theme.css`.

The terminal frames the evidence; it never competes with it. Scans, video frames and page text are the brightest, largest things on screen, and the CRT texture sits behind and over them as a thin atmospheric layer (grain at 5.5% dark / 3% light, scanlines as an overlay blend the visitor can switch off).

Density is high on purpose (archives are lists), but rows breathe: small mono metadata, generous card gaps, nothing decorative that doesn't help someone find or check a file.

**Key Characteristics:**
- Dark terminal first; a warm paper light theme (a printout of the same terminal) with AA-tuned text colours.
- Phosphor `signal` (green by default; visitor can retune to cyan, amber or violet like a monitor's phosphor) means on, active, primary.
- CRT layers: `.crt-grain` film noise always on, `.crt-scan` scanlines on by default and switchable.
- Mono for metadata and labels, grotesk for titles and reading, Press Start 2P for the wordmark and page titles.
- Terminal motion vocabulary: blink, pulse, marquee ticker, scan drift; all stop under reduced motion.
- Flat glass surfaces separated by hairline borders, not shadows.

## Colors

Near-black blue CRT glass with cool grey text and one phosphor glow; data accents tint sources and boards like coloured terminal output.

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
**The One Phosphor Rule.** Only `signal` means "on". Never use it for decoration, headings or illustration (the UFO half of the wordmark is the one exception).
**The Amber Means Trouble Rule.** Amber in UI chrome only ever means "failed, try again".
**The Two Themes Rule.** Every colour pair must read in both themes; light text colours are AA-tuned (≥4.5:1 on `bg`), never reuse dark-theme hexes in light.

## Typography

**Display Font:** Press Start 2P (with monospace)
**Body Font:** Space Grotesk (with system-ui, sans-serif)
**Label/Mono Font:** JetBrains Mono (with monospace)

**Character:** Terminal readout and stamped file headers (mono), an 8-bit pixel face for the terminal's own name, and a readable modern grotesk for what people actually read.

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
- **The One Scale Rule.** All padding, margin and gap use one 4px-based scale: 2, 4, 8, 12, 16, 20, 24, 32, 48, 64px (Tailwind `0.5 1 2 3 4 5 6 8 12 16`). No arbitrary spacing (`p-[11px]`, `gap-[7px]`) and no off-scale half-steps (`1.5`, `2.5`, `3.5`). Applied across `web/src` on 2026-11-02 (ties snap to the 8px multiple, then the larger step); keep it that way. Sizes (`h-`, `w-`), positions (`top-`, `left-`) and radii are not spacing and keep their own values.
- Reading width caps around 560–680px; dialogs at 360px.
- Must work from 320px to wide desktop with no horizontal page scroll; horizontal chip rows scroll with hidden scrollbars (`[data-scroll]`).

## Elevation & Depth

Flat glass. The only layers above the content are the CRT overlays: `.crt-grain` (z 1, opacity `--grain`) and `.crt-scan` (z 40, overlay blend, 6s drift), both pointer-events none. Depth comes from the neutral ladder (`bg` → `surface` → `surface2` → `elev`) and hairline borders, plus position for pressed state. The one theme shadow (`--shadow`) and a few one-offs belong to floating overlays (sheets, popovers, media viewer) where something genuinely sits above the page.

### Shadow Vocabulary
- **Overlay lift** (`box-shadow: 0 18px 50px -16px rgba(0,0,0,0.72)`; light: `0 18px 50px -18px rgba(50,60,80,0.28)`): sheets, popovers, menus.
- **Scrim** (`box-shadow: 0 0 0 999px rgba(0,0,0,0.35)`): spotlight behind a focused overlay.

### Named Rules
**The Flat Glass Rule.** Cards and controls never cast shadows; everything sits on the same screen. Pressed = scale down slightly; selected = `signal-dim` fill and `signal` text.

## Shapes

Gently rounded rectangles by family, like the rounded corners of a CRT screen: chips 7px, keys and tabs 11px, fields 12px, cards 14–15px, panels and sheets 16px, dials and avatars fully circular. Hairline 1px borders everywhere; a 2px border only on media placeholders. Thumbnails are cropped to fill (`object-cover`) with a slight contrast lift.

## Components

Terminal keys: flat at rest, glowing phosphor when on, a small press-scale on tap; nothing bounces.

### Buttons
- **Shape:** key radius (11px); compact inline actions use 6–8px.
- **Primary:** `signal` fill, `on-signal` text, mono bold 12px with 0.5px tracking, 12×16px padding (12×24px for the composer post key).
- **Press:** scales to .96–.97 on `:active`; disabled = 60% opacity, no pointer.
- **Outline / ghost:** pill with `signal` border and text, fills on hover (filter "apply"-style actions); plain icon buttons are 36×36 (touch) / 32×32 (mouse) with 18px / 16px lucide icons.

### Chips
- **Style:** the shared `.tag` class: 7px radius, `line2` border, mono 10px `dim` text, 4×8px padding.
- **State:** hover turns border and text `signal`. Active filter chips use `signal-dim` fill with `signal` text. Image badges on cards are 5px-radius dark (`rgba(0,0,0,.85)`) stamps with mono 8–9px bold text; the redacted badge is `red` with white text.

### Cards / Containers
- **Corner Style:** 14px (grid), 15px (feed).
- **Background:** `surface`, media area on `bg2` with a hairline under it.
- **Shadow Strategy:** none (Flat Glass Rule).
- **Border:** `line`, `line2` on hover; press scales to .985.
- **Internal Padding:** 12px; meta line (mono 9px `faint`), source line in its data accent, title, optional italic one-liner in `dim`.

### Inputs / Fields
- **Style:** 12px radius, `surface` fill, `line2` border, mono 12.5px `ink` text, `faint` placeholder, leading search glyph.
- **Focus:** border moves to `signal`; no glow.

### Navigation
- **Phone bottom tab:** 4 icon tabs + More, min 44px tall, icons `dim`; active tab is `signal` and shows its mono 9px label, others keep the label `sr-only`. Re-tap scrolls to top.
- **Desktop top nav:** 44px icon tabs with 11px radius; active = `signal-dim` fill + `signal` icon + visible label; hover = `surface`.

### CRT overlay (signature)
Full-bleed `.crt-grain` and `.crt-scan` layers inside the app shell, theme-aware via `--grain`; scanlines follow the visitor's `scanlines` setting in ThemeProvider. Together with the pixel wordmark `REAL<signal>UFO</signal>` and the marquee ticker, this is the brand.

## Do's and Don'ts

### Do:
- **Do** treat the prototype (`realufo-handoff/RealUFO.dc.html`) and `web/src/theme/theme.css` as the source of the look.
- **Do** keep the CRT layers (grain, scanlines, phosphor signal, pixel wordmark, mono readouts) on every screen, under the content.
- **Do** use theme tokens (`bg`…`signal`) via Tailwind names or `var(--…)`; never raw hexes in components.
- **Do** keep touch targets ≥36×36px (nav 44px) and icons 18px in 36px controls.
- **Do** write metadata in mono and reading text in grotesk (Stamp Rule).
- **Do** use the terminal motion set (blink, pulse, marquee, scandrift, fadeup, sheetin) before inventing new keyframes; UI transitions ~150ms ease-out, sheets the 300ms `cubic-bezier(.32,.72,0,1)` slide; everything stops under `prefers-reduced-motion`.
- **Do** run colour pairs through `dataInk()` for data accents so light theme stays ≥4.5:1.

### Don't:
- **Don't** use `signal` for decoration, headings or illustration (One Phosphor Rule).
- **Don't** add shadows or gradients to cards and controls; gradients are allowed only as a legibility scrim over media.
- **Don't** let CRT texture sit on top of evidence at a strength that hurts reading a scan or frame; the media viewer is where texture steps back.
- **Don't** set body text or long labels in Press Start 2P (One Pixel Voice Rule).
- **Don't** let chrome outshine the evidence: scans and frames stay the largest, brightest element.
