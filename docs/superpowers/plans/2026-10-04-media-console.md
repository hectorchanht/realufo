# Media Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Doc page's crowded media toolbar with a media console: an always-visible strip (zoom, magnifier, presets P1–P4, console button, what's on, link, help) and a console body in a style the visitor picks (Simple, DJ deck, Walkman), with faders, effect/tool pads or keys, an iPod-style click wheel, a magnifier knob, presets and arrange mode, all remembered on the device.

**Architecture:** Pure state helpers in `web/src/lib/` (effects, presets, console prefs, video transport hook) feed one `MediaControls` object that Doc builds each render. `web/src/components/console/` holds small presentational parts (Fader, Knob, ClickWheel, PadGrid, Keyboard, CassetteWindow), three bodies (Simple, DJ, Walkman) registered in `bodies.ts`, and `MediaConsole` (strip + picker + chosen body). URL params stay the single source of truth for the look; localStorage only holds per-device conveniences.

**Tech Stack:** React 19, TypeScript 6, Tailwind 3, lucide-react, Vitest 4 + Testing Library (jsdom). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-04-media-dj-console-design.md`

## Global Constraints

- Icon-only controls: every button has `aria-label` and `title` in plain words (memory: icons-less-text, user-friendly-ui).
- Tap targets: at least 36px on touch, 32px with a mouse; Walkman black keys 36×36px on a 375px phone.
- URL params unchanged: `br ct sat gam inv bw pal sharp lens mag` (look + lens) and the shared-view params `z cx cy rot flip`; share links keep working, `F` key and `?flip=1` still flip.
- No new npm dependencies; drag uses pointer events.
- Colours from site tokens only (`--signal`, `line`, `line2`, `surface`, `bg2`, `ink`, `dim`, `faint`, `amber`); no gradients, glows or textures; motion 120–200ms eases, none under `prefers-reduced-motion`.
- Every `localStorage` read/write in try/catch; bad or missing data → defaults; keys: `ru:media-presets`, `ru:media-pads`, `ru:console-open` (falls back to old `ru:adjust-open`), `ru:console-tip`, `ru:media-skin`.
- Presets store look + magnifier strength + Motion on/off only (not zoom, pan, turn).
- Default style for a first visit: Simple.
- All web tests pass (`cd web && npx vitest run`), `npx tsc --noEmit -p .` clean, `npx oxlint src` clean, `npm run build` succeeds.
- Commit after every task; message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Stage only the files the task names (other chats share this checkout).

## Review Focus

1. **Storage unavailable or corrupt** (private mode, quota, hand-edited JSON): the console opens with defaults and nothing throws. Test: Task 8 renders Doc with `localStorage.getItem` throwing.
2. **Moving to the next file mid-use**: A–B, loop, capture state, save-preset mode, arrange mode and the style picker reset; presets and pad order stay. Tests: Task 4 (`resetKey`), Task 8 (`key={id}` on the console).
3. **Click wheel edges**: crossing ±180° doesn't jump, a wobble under 6° is a press, a lost pointer ends the gesture, arrow keys step. Tests: Task 6.
4. **Presets across file kinds**: P4 (Motion) on an image applies its look but never swaps the video source and is never lit; `1`–`4` keys are ignored while typing in a field. Tests: Task 2, Task 8.
5. **Touch drag safety**: outside arrange mode a drag on a pad never reorders and Original still works while held; in arrange mode a drag onto another group is ignored. Tests: Task 7.

---

### Task 1: Effects model

**Files:**
- Create: `web/src/lib/mediaEffects.ts`
- Test: `web/src/tests/mediaEffects.test.ts`

**Interfaces:**
- Consumes: `adjustFilter`, `DEFAULT_ADJUST`, `ImageAdjust` from `web/src/components/ImageTools.tsx`.
- Produces: `EFFECT_IDS`, `type EffectId = "enhance" | "invert" | "bw" | "night" | "ironbow" | "rainbow" | "sharpen" | "original"`, `isEffectOn(a: ImageAdjust, id: EffectId): boolean`, `toggleEffect(a: ImageAdjust, id: EffectId): ImageAdjust`.

- [ ] **Step 1: Write the failing test**

```ts
// web/src/tests/mediaEffects.test.ts
import { describe, expect, it } from "vitest";
import { DEFAULT_ADJUST } from "../components/ImageTools";
import { EFFECT_IDS, isEffectOn, toggleEffect } from "../lib/mediaEffects";

describe("mediaEffects", () => {
  it("nothing is on by default", () => {
    expect(EFFECT_IDS.filter((id) => isEffectOn(DEFAULT_ADJUST, id))).toEqual([]);
  });

  it("a look toggles on and off, keeping palette and sharpen", () => {
    const a = toggleEffect({ ...DEFAULT_ADJUST, palette: "ironbow", sharpen: true }, "night");
    expect(a).toMatchObject({ gamma: 170, contrast: 110, palette: "ironbow", sharpen: true });
    expect(isEffectOn(a, "night")).toBe(true);
    expect(isEffectOn(a, "enhance")).toBe(false);
    const b = toggleEffect(a, "night");
    expect(b).toMatchObject({ gamma: 100, contrast: 100, palette: "ironbow", sharpen: true });
  });

  it("one look at a time: Enhance replaces Night", () => {
    const a = toggleEffect(toggleEffect(DEFAULT_ADJUST, "night"), "enhance");
    expect(isEffectOn(a, "enhance")).toBe(true);
    expect(isEffectOn(a, "night")).toBe(false);
    expect(a.gamma).toBe(100);
  });

  it("heat palettes switch between each other; sharpen is independent", () => {
    const a = toggleEffect(DEFAULT_ADJUST, "ironbow");
    expect(a.palette).toBe("ironbow");
    const b = toggleEffect(a, "rainbow");
    expect(b.palette).toBe("rainbow");
    expect(isEffectOn(b, "ironbow")).toBe(false);
    const c = toggleEffect(toggleEffect(b, "sharpen"), "night");
    expect(isEffectOn(c, "sharpen") && isEffectOn(c, "night") && isEffectOn(c, "rainbow")).toBe(true);
    expect(toggleEffect(c, "rainbow").palette).toBe("none");
  });

  it("invert set by the I key alone counts as the Invert look; original has no state", () => {
    expect(isEffectOn({ ...DEFAULT_ADJUST, invert: true }, "invert")).toBe(true);
    expect(isEffectOn(DEFAULT_ADJUST, "original")).toBe(false);
    expect(toggleEffect(DEFAULT_ADJUST, "original")).toBe(DEFAULT_ADJUST);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/tests/mediaEffects.test.ts`
Expected: FAIL with "Failed to resolve import "../lib/mediaEffects""

- [ ] **Step 3: Write minimal implementation**

```ts
// web/src/lib/mediaEffects.ts
// Effects for the media console: the one-tap looks (Enhance, Invert, B&W,
// Night), the heat palettes, Sharpen, and Original (hold to compare; no
// state of its own). Pure: on/off is read from the current look, so the URL
// stays the only source of truth.
import { adjustFilter } from "../components/ImageTools";
import type { ImageAdjust } from "../components/ImageTools";

export const EFFECT_IDS = ["enhance", "invert", "bw", "night", "ironbow", "rainbow", "sharpen", "original"] as const;
export type EffectId = (typeof EFFECT_IDS)[number];

// The tone controls a look sets; palette and sharpen are left as they are.
const TONE = { brightness: 100, contrast: 100, saturate: 100, gamma: 100, invert: false, gray: false };
const LOOKS = {
  enhance: { brightness: 110, contrast: 140, saturate: 120 },
  invert: { invert: true },
  bw: { contrast: 120, gray: true },
  night: { gamma: 170, contrast: 110 },
} satisfies Record<string, Partial<ImageAdjust>>;
type LookId = keyof typeof LOOKS;
const isLook = (id: EffectId): id is LookId => id in LOOKS;

export function isEffectOn(a: ImageAdjust, id: EffectId): boolean {
  if (id === "ironbow" || id === "rainbow") return a.palette === id;
  if (id === "sharpen") return a.sharpen;
  if (isLook(id)) return adjustFilter({ ...a, ...TONE, ...LOOKS[id] }) === adjustFilter(a);
  return false; // original: momentary, shown by `compare`
}

export function toggleEffect(a: ImageAdjust, id: EffectId): ImageAdjust {
  if (id === "ironbow" || id === "rainbow") return { ...a, palette: a.palette === id ? "none" : id };
  if (id === "sharpen") return { ...a, sharpen: !a.sharpen };
  if (isLook(id)) return isEffectOn(a, id) ? { ...a, ...TONE } : { ...a, ...TONE, ...LOOKS[id] };
  return a;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/tests/mediaEffects.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/mediaEffects.ts web/src/tests/mediaEffects.test.ts
git commit -m "feat(web): media effects model (looks, heat palettes, sharpen, original)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Presets P1–P4

**Files:**
- Create: `web/src/lib/mediaPresets.ts`
- Test: `web/src/tests/mediaPresets.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_ADJUST`, `LENS_MAGS`, `adjustFilter`, `adjustFromParams`, `adjustToParams`, `ImageAdjust` from `ImageTools.tsx`.
- Produces: `interface Preset { slot: 1|2|3|4; name: string; adjust: ImageAdjust; mag: number; motion: boolean }`, `interface Setup { adjust: ImageAdjust; mag: number; motion: boolean }`, `DEFAULT_PRESETS: Preset[]`, `loadPresets(): Preset[]`, `savePresets(ps: Preset[]): void`, `storePreset(ps: Preset[], slot: Preset["slot"], cur: Setup): Preset[]`, `presetMatches(p: Preset, cur: Setup, media: "image"|"video"): boolean`, `sanitizeAdjust(x: unknown): ImageAdjust`.

- [ ] **Step 1: Write the failing test**

```ts
// web/src/tests/mediaPresets.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ADJUST } from "../components/ImageTools";
import { DEFAULT_PRESETS, loadPresets, presetMatches, sanitizeAdjust, savePresets, storePreset } from "../lib/mediaPresets";

afterEach(() => {
  localStorage.removeItem("ru:media-presets");
  vi.restoreAllMocks();
});

describe("mediaPresets", () => {
  it("defaults: Clean, Night hunt, Thermal, Motion", () => {
    expect(loadPresets().map((p) => p.name)).toEqual(["Clean", "Night hunt", "Thermal", "Motion"]);
    expect(DEFAULT_PRESETS[1]).toMatchObject({ mag: 5, adjust: { gamma: 170, contrast: 110, sharpen: true } });
  });

  it("a stored slot survives a reload and is named 'Your setup'", () => {
    const cur = { adjust: { ...DEFAULT_ADJUST, invert: true }, mag: 8, motion: true };
    savePresets(storePreset(loadPresets(), 2, cur));
    const p = loadPresets()[1];
    expect(p).toMatchObject({ slot: 2, name: "Your setup", mag: 8, motion: true, adjust: { invert: true } });
    expect(loadPresets()[0].name).toBe("Clean"); // other slots untouched
  });

  it("corrupt, old-version or partial storage falls back per slot", () => {
    localStorage.setItem("ru:media-presets", "{not json");
    expect(loadPresets()).toEqual(DEFAULT_PRESETS);
    localStorage.setItem("ru:media-presets", JSON.stringify({ v: 9, presets: [] }));
    expect(loadPresets()).toEqual(DEFAULT_PRESETS);
    localStorage.setItem("ru:media-presets", JSON.stringify({ v: 1, presets: [{ slot: 3, name: "x".repeat(99), adjust: { brightness: "abc", palette: "lava" }, mag: 7, motion: "yes" }] }));
    const p = loadPresets();
    expect(p[0]).toEqual(DEFAULT_PRESETS[0]);
    expect(p[2]).toMatchObject({ name: "x".repeat(40), mag: 3, motion: false, adjust: { brightness: 100, palette: "none", gamma: 100 } });
  });

  it("sanitizeAdjust fills missing fields and clamps", () => {
    expect(sanitizeAdjust(null)).toEqual(DEFAULT_ADJUST);
    expect(sanitizeAdjust({ contrast: 999 }).contrast).toBe(200);
  });

  it("storage that throws: defaults, and saving doesn't throw", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(loadPresets()).toEqual(DEFAULT_PRESETS);
    expect(() => savePresets(DEFAULT_PRESETS)).not.toThrow();
  });

  it("matches: a Motion preset is never lit on an image; on video motion must agree", () => {
    const clean = { adjust: DEFAULT_ADJUST, mag: 3, motion: false };
    expect(presetMatches(DEFAULT_PRESETS[0], clean, "image")).toBe(true);
    expect(presetMatches(DEFAULT_PRESETS[3], clean, "image")).toBe(false);
    expect(presetMatches(DEFAULT_PRESETS[3], clean, "video")).toBe(false);
    expect(presetMatches(DEFAULT_PRESETS[3], { ...clean, motion: true }, "video")).toBe(true);
    expect(presetMatches(DEFAULT_PRESETS[0], { ...clean, mag: 5 }, "image")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/tests/mediaPresets.test.ts`
Expected: FAIL with "Failed to resolve import "../lib/mediaPresets""

- [ ] **Step 3: Write minimal implementation**

```ts
// web/src/lib/mediaPresets.ts
// Presets P1–P4 for the media console: a look, the magnifier strength and
// Motion on/off, one tap to apply. Not zoom, pan or turn: those belong to
// one picture. Stored on this device only; anything unreadable falls back
// to the defaults slot by slot.
import { DEFAULT_ADJUST, LENS_MAGS, adjustFilter, adjustFromParams, adjustToParams } from "../components/ImageTools";
import type { ImageAdjust } from "../components/ImageTools";

export interface Preset {
  slot: 1 | 2 | 3 | 4;
  name: string;
  adjust: ImageAdjust;
  mag: number;
  motion: boolean;
}
export interface Setup {
  adjust: ImageAdjust;
  mag: number;
  motion: boolean;
}

export const DEFAULT_PRESETS: Preset[] = [
  { slot: 1, name: "Clean", adjust: DEFAULT_ADJUST, mag: 3, motion: false },
  { slot: 2, name: "Night hunt", adjust: { ...DEFAULT_ADJUST, gamma: 170, contrast: 110, sharpen: true }, mag: 5, motion: false },
  { slot: 3, name: "Thermal", adjust: { ...DEFAULT_ADJUST, palette: "ironbow", contrast: 120 }, mag: 3, motion: false },
  { slot: 4, name: "Motion", adjust: DEFAULT_ADJUST, mag: 3, motion: true },
];

const KEY = "ru:media-presets";

/** Anything → a valid look: the URL-param round trip clamps numbers and drops unknown palettes. */
export function sanitizeAdjust(x: unknown): ImageAdjust {
  const o = x && typeof x === "object" ? (x as Partial<ImageAdjust>) : {};
  const sp = new URLSearchParams();
  adjustToParams(sp, { ...DEFAULT_ADJUST, ...o } as ImageAdjust);
  return adjustFromParams(sp);
}

export function loadPresets(): Preset[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as { v?: number; presets?: unknown } | null;
    if (raw?.v !== 1 || !Array.isArray(raw.presets)) return DEFAULT_PRESETS;
    const saved = raw.presets as Partial<Record<keyof Preset, unknown>>[];
    return DEFAULT_PRESETS.map((d) => {
      const p = saved.find((q) => q && q.slot === d.slot);
      if (!p) return d;
      return {
        slot: d.slot,
        name: typeof p.name === "string" && p.name ? p.name.slice(0, 40) : d.name,
        adjust: sanitizeAdjust(p.adjust),
        mag: LENS_MAGS.includes(p.mag as number) ? (p.mag as number) : 3,
        motion: p.motion === true,
      };
    });
  } catch {
    return DEFAULT_PRESETS;
  }
}

export function savePresets(ps: Preset[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, presets: ps }));
  } catch {
    /* private mode etc.: kept for this page only */
  }
}

export const storePreset = (ps: Preset[], slot: Preset["slot"], cur: Setup): Preset[] =>
  ps.map((p) => (p.slot === slot ? { slot, name: "Your setup", adjust: cur.adjust, mag: cur.mag, motion: cur.motion } : p));

/** Lit when the current setup is this preset. On an image a Motion preset is never lit (Motion is video only). */
export function presetMatches(p: Preset, cur: Setup, media: "image" | "video"): boolean {
  if (media === "image" && p.motion) return false;
  return adjustFilter(p.adjust) === adjustFilter(cur.adjust) && p.mag === cur.mag && (media === "image" || p.motion === cur.motion);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/tests/mediaPresets.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/mediaPresets.ts web/src/tests/mediaPresets.test.ts
git commit -m "feat(web): media presets P1-P4 (look + magnifier + motion, stored per device)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Console preferences (style, open, tip, pad order)

**Files:**
- Create: `web/src/lib/consolePrefs.ts`
- Test: `web/src/tests/consolePrefs.test.ts`

**Interfaces:**
- Consumes: `EFFECT_IDS`, `EffectId` from `web/src/lib/mediaEffects.ts` (Task 1).
- Produces: `TOOL_IDS`, `type ToolId = "ruler"|"motion"|"turn"|"save"|"post"|"download"`, `SKINS`, `type Skin = "simple"|"dj"|"walkman"`, `interface PadOrder { effects: EffectId[]; tools: ToolId[] }`, `normalizeOrder`, `loadOrder(): PadOrder`, `saveOrder(o: PadOrder)`, `defaultOrder(): PadOrder`, `moveItem<T>(list, from, to): T[]`, `mergeVisible<T>(full, visibleNext): T[]`, `loadSkin(): Skin`, `saveSkin(s: Skin)`, `loadOpen(): boolean`, `saveOpen(o: boolean)`, `tipSeen(): boolean`, `markTipSeen()`.

- [ ] **Step 1: Write the failing test**

```ts
// web/src/tests/consolePrefs.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { EFFECT_IDS } from "../lib/mediaEffects";
import {
  TOOL_IDS, defaultOrder, loadOpen, loadOrder, loadSkin, markTipSeen, mergeVisible, moveItem, normalizeOrder, saveOpen, saveOrder, saveSkin, tipSeen,
} from "../lib/consolePrefs";

afterEach(() => {
  for (const k of ["ru:media-pads", "ru:media-skin", "ru:console-open", "ru:adjust-open", "ru:console-tip"]) localStorage.removeItem(k);
  vi.restoreAllMocks();
});

describe("consolePrefs", () => {
  it("order: defaults, round trip, unknown dropped, missing appended, duplicates dropped", () => {
    expect(loadOrder()).toEqual(defaultOrder());
    saveOrder({ effects: [...EFFECT_IDS].reverse(), tools: [...TOOL_IDS] });
    expect(loadOrder().effects[0]).toBe("original");
    expect(normalizeOrder(["night", "zap", "night", "bw"], EFFECT_IDS)).toEqual(["night", "bw", "enhance", "invert", "ironbow", "rainbow", "sharpen", "original"]);
    localStorage.setItem("ru:media-pads", "garbage");
    expect(loadOrder()).toEqual(defaultOrder());
  });

  it("moveItem and mergeVisible (reorder what is shown, keep hidden ones in place)", () => {
    expect(moveItem(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    // image shows ruler, turn, save; motion/post/download are hidden
    const full = ["ruler", "motion", "turn", "save", "post", "download"];
    expect(mergeVisible(full, ["save", "ruler", "turn"])).toEqual(["save", "motion", "ruler", "turn", "post", "download"]);
  });

  it("style: simple by default, remembered, junk → simple", () => {
    expect(loadSkin()).toBe("simple");
    saveSkin("walkman");
    expect(loadSkin()).toBe("walkman");
    localStorage.setItem("ru:media-skin", "disco");
    expect(loadSkin()).toBe("simple");
  });

  it("open: remembered, falls back to the old Adjust key; tip seen once", () => {
    expect(loadOpen()).toBe(false);
    localStorage.setItem("ru:adjust-open", "1");
    expect(loadOpen()).toBe(true);
    saveOpen(false);
    expect(loadOpen()).toBe(false);
    expect(tipSeen()).toBe(false);
    markTipSeen();
    expect(tipSeen()).toBe(true);
  });

  it("storage that throws never breaks: defaults", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(loadOrder()).toEqual(defaultOrder());
    expect(loadSkin()).toBe("simple");
    expect(loadOpen()).toBe(false);
    expect(() => saveSkin("dj")).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/tests/consolePrefs.test.ts`
Expected: FAIL with "Failed to resolve import "../lib/consolePrefs""

- [ ] **Step 3: Write minimal implementation**

```ts
// web/src/lib/consolePrefs.ts
// Per-device conveniences for the media console: the style the visitor
// picked, whether the console is open, the first-time hint, and the order
// of the pads/keys. localStorage only; any failure means defaults.
import { EFFECT_IDS } from "./mediaEffects";
import type { EffectId } from "./mediaEffects";

export const TOOL_IDS = ["ruler", "motion", "turn", "save", "post", "download"] as const;
export type ToolId = (typeof TOOL_IDS)[number];
export const SKINS = ["simple", "dj", "walkman"] as const;
export type Skin = (typeof SKINS)[number];
export interface PadOrder {
  effects: EffectId[];
  tools: ToolId[];
}

const K = { order: "ru:media-pads", skin: "ru:media-skin", open: "ru:console-open", oldOpen: "ru:adjust-open", tip: "ru:console-tip" };

function get(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function set(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode etc.: lasts for this page only */
  }
}

/** A saved order → every known id once: unknown and repeated ids dropped, missing ones appended. */
export function normalizeOrder<T extends string>(saved: unknown, all: readonly T[]): T[] {
  const kept = Array.isArray(saved) ? [...new Set(saved.filter((x): x is T => (all as readonly unknown[]).includes(x)))] : [];
  return [...kept, ...all.filter((x) => !kept.includes(x))];
}

export const defaultOrder = (): PadOrder => ({ effects: [...EFFECT_IDS], tools: [...TOOL_IDS] });

export function loadOrder(): PadOrder {
  let raw: { v?: number; effects?: unknown; tools?: unknown } | null = null;
  try {
    raw = JSON.parse(get(K.order) ?? "null");
  } catch {
    raw = null;
  }
  const ok = raw?.v === 1;
  return { effects: normalizeOrder(ok ? raw!.effects : null, EFFECT_IDS), tools: normalizeOrder(ok ? raw!.tools : null, TOOL_IDS) };
}
export const saveOrder = (o: PadOrder) => set(K.order, JSON.stringify({ v: 1, ...o }));

export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}

/** Put a reordered visible subset back into the full order: visible ids refill their old places in their new order. */
export function mergeVisible<T>(full: readonly T[], visibleNext: readonly T[]): T[] {
  const queue = [...visibleNext];
  const shown = new Set(visibleNext);
  return full.map((x) => (shown.has(x) ? (queue.shift() as T) : x));
}

export const loadSkin = (): Skin => {
  const s = get(K.skin);
  return (SKINS as readonly (string | null)[]).includes(s) ? (s as Skin) : "simple";
};
export const saveSkin = (s: Skin) => set(K.skin, s);
export const loadOpen = () => (get(K.open) ?? get(K.oldOpen)) === "1";
export const saveOpen = (o: boolean) => set(K.open, o ? "1" : "0");
export const tipSeen = () => get(K.tip) === "1";
export const markTipSeen = () => set(K.tip, "1");
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/tests/consolePrefs.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/consolePrefs.ts web/src/tests/consolePrefs.test.ts
git commit -m "feat(web): media console prefs (style, open, first-time tip, pad order)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Video transport hook (refactor, no visible change)

**Files:**
- Create: `web/src/lib/useVideoTransport.ts`
- Modify: `web/src/components/VideoTools.tsx` (remove `FPS`, `SPEEDS`, `frameOf`, `grabFrame`, `isTyping` and all state/effects/handlers from `VideoTransport`; `VideoTransport` renders from a `transport` prop)
- Modify: `web/src/screens/Doc.tsx` (call the hook, pass `transport` to `VideoTransport`)
- Test: `web/src/tests/videoTransport.test.tsx`

**Interfaces:**
- Consumes: `renderPng` from `ImageTools.tsx`; `formatMoment`, `VideoCrop` from `lib/recordMedia.ts`; `MediaView` from `lib/mediaView.ts`.
- Produces:

```ts
export const FPS: number; export const SPEEDS: number[]; export const WHEEL_SPEEDS: number[]; // [0.25, 0.5, 1, 2]
export const frameOf: (t: number) => number;
export function isTyping(): boolean;
export const abLabel: (ab: { a: number; b?: number } | null) => string; // "Loop A–B: set A" | "…: set B" | "…: clear"
export interface TransportOptions {
  videoRef: RefObject<HTMLVideoElement | null>; crop: VideoCrop | null; fileUrl: string; name: string;
  filter: string; view: MediaView; startAt?: number; keys: boolean;
  onPost: (frame: File, t: number) => void; stage?: HTMLElement | null; resetKey: string;
}
export interface Transport {
  t: number; dur: number; playing: boolean; rate: number; loop: boolean; muted: boolean;
  ab: { a: number; b?: number } | null; capture: "idle" | "busy" | "failed"; full: boolean;
  now(): number; seek(t: number): void; togglePlay(): void; step(frames: number): void; setSpeed(s: number): void;
  nextWheelSpeed(): void; toggleLoop(): void; toggleMute(): void; toggleFull(): void; markAb(): void;
  grab(then: "save" | "post"): Promise<void>; download(): void;
}
export function useVideoTransport(o: TransportOptions): Transport;
```

- [ ] **Step 1: Write the failing test**

```tsx
// web/src/tests/videoTransport.test.tsx
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { createRef } from "react";
import { DEFAULT_VIEW } from "../lib/mediaView";
import { WHEEL_SPEEDS, abLabel, useVideoTransport } from "../lib/useVideoTransport";

function setup(resetKey = "a") {
  const video = document.createElement("video");
  vi.spyOn(video, "pause").mockImplementation(() => {});
  const videoRef = createRef<HTMLVideoElement>() as { current: HTMLVideoElement | null };
  videoRef.current = video;
  const hook = renderHook(
    ({ k }) => useVideoTransport({ videoRef, crop: null, fileUrl: "/api/file/x", name: "x", filter: "", view: DEFAULT_VIEW, keys: false, onPost: () => {}, resetKey: k }),
    { initialProps: { k: resetKey } },
  );
  return { video, hook };
}

describe("useVideoTransport", () => {
  it("steps whole frames (pausing), sets speed, cycles wheel speeds", () => {
    const { video, hook } = setup();
    video.currentTime = 2;
    act(() => hook.result.current.step(3));
    expect(video.currentTime).toBeCloseTo(2.1);
    act(() => hook.result.current.setSpeed(0.5));
    expect(video.playbackRate).toBe(0.5);
    act(() => hook.result.current.nextWheelSpeed());
    expect(video.playbackRate).toBe(1);
    video.playbackRate = 1.5; // a speed not on the wheel → back to 1×
    act(() => hook.result.current.nextWheelSpeed());
    expect(video.playbackRate).toBe(1);
    expect(WHEEL_SPEEDS).toEqual([0.25, 0.5, 1, 2]);
  });

  it("A–B marks start, end, clears; moving to another file clears A–B and loop", () => {
    const { video, hook } = setup();
    video.currentTime = 1;
    act(() => hook.result.current.markAb());
    video.currentTime = 2;
    act(() => hook.result.current.markAb());
    expect(hook.result.current.ab).toEqual({ a: 1, b: 2 });
    expect(abLabel(hook.result.current.ab)).toBe("Loop A–B: clear");
    act(() => hook.result.current.toggleLoop());
    expect(video.loop).toBe(true);
    hook.rerender({ k: "b" });
    expect(hook.result.current.ab).toBeNull();
    expect(hook.result.current.loop).toBe(false);
    expect(video.loop).toBe(false);
    expect(abLabel(null)).toBe("Loop A–B: set A");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/tests/videoTransport.test.tsx`
Expected: FAIL with "Failed to resolve import "../lib/useVideoTransport""

- [ ] **Step 3: Create the hook (moving code out of `VideoTransport`)**

```ts
// web/src/lib/useVideoTransport.ts
// Video transport state for the Doc page: play, frame step, speed, loop,
// A–B loop, mute, full screen, frame capture and download, plus the
// playback keyboard shortcuts. One state shared by the playback row
// (VideoTransport) and the media console. `resetKey` (the record id)
// clears A–B, loop and capture when the page moves to another file.
//
// Playback stays on the CDN <video>; capture seeks a hidden same-origin
// copy through /api/file/:id so the canvas can be read.
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { renderPng } from "../components/ImageTools";
import { formatMoment } from "./recordMedia";
import type { VideoCrop } from "./recordMedia";
import type { MediaView } from "./mediaView";

// ponytail: fixed 30 fps (the DoD clips are ~29.97/30); read the real rate via
// requestVideoFrameCallback if frame-exact stepping ever matters.
export const FPS = 30;
export const SPEEDS = [0.1, 0.25, 0.5, 1, 1.5, 2];
/** Speeds the click wheel's top press cycles through. */
export const WHEEL_SPEEDS = [0.25, 0.5, 1, 2];

// currentTime lands a hair under k/FPS (0.066666 × 30 = 1.99998), so nudge before flooring
export const frameOf = (t: number) => Math.floor(t * FPS + 0.01);

export const abLabel = (ab: { a: number; b?: number } | null) => `Loop A–B: ${!ab ? "set A" : ab.b === undefined ? "set B" : "clear"}`;

export function isTyping() {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

/** Seek a hidden same-origin copy of the file to `time` and encode that frame (bars cropped, filter, rotate, flip applied) as PNG. */
function grabFrame(src: string, time: number, filter: string, view: MediaView, crop: VideoCrop | null): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.muted = true;
    v.preload = "auto";
    v.onerror = () => reject(new Error("load failed"));
    // seeking to the current position fires no `seeked`, so never seek to exactly 0
    v.onloadedmetadata = () => (v.currentTime = Math.max(time, 0.001));
    v.onseeked = () => {
      const png = renderPng(v, crop ?? { w: v.videoWidth, h: v.videoHeight, x: 0, y: 0 }, filter, view); // draws now, encodes async
      v.removeAttribute("src");
      v.load();
      png.then(resolve, reject);
    };
    v.src = src;
  });
}

export interface TransportOptions {
  videoRef: RefObject<HTMLVideoElement | null>;
  crop: VideoCrop | null; // saved frames drop the black bars too
  fileUrl: string; // same-origin copy for capture
  name: string; // capture file name prefix
  filter: string;
  view: MediaView;
  startAt?: number; // seconds (?t=)
  keys: boolean; // keyboard shortcuts live (video page, no overlay open)
  onPost: (frame: File, t: number) => void;
  /** The media panel: fullscreened whole so filters, zoom and the lens come along. */
  stage?: HTMLElement | null;
  resetKey: string;
}

export interface Transport {
  t: number;
  dur: number;
  playing: boolean;
  rate: number;
  loop: boolean;
  muted: boolean;
  ab: { a: number; b?: number } | null;
  capture: "idle" | "busy" | "failed";
  full: boolean;
  now(): number;
  seek(t: number): void;
  togglePlay(): void;
  step(frames: number): void;
  setSpeed(s: number): void;
  nextWheelSpeed(): void;
  toggleLoop(): void;
  toggleMute(): void;
  toggleFull(): void;
  markAb(): void;
  grab(then: "save" | "post"): Promise<void>;
  download(): void;
}

export function useVideoTransport(o: TransportOptions): Transport {
  const { videoRef, startAt, stage, resetKey } = o;
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [loop, setLoop] = useState(false);
  const [muted, setMuted] = useState(false);
  const [ab, setAb] = useState<{ a: number; b?: number } | null>(null);
  const [capture, setCapture] = useState<"idle" | "busy" | "failed">("idle");
  const [full, setFull] = useState(false);
  const abRef = useRef(ab);
  useEffect(() => {
    abRef.current = ab;
  }, [ab]);

  // another file: what was set for the last one doesn't carry over
  useEffect(() => {
    setAb(null);
    setCapture("idle");
    setLoop(false);
    const el = videoRef.current;
    if (el) el.loop = false;
  }, [resetKey, videoRef]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let raf = 0;
    // per-frame while playing: smooth timecode + tight A–B looping (timeupdate is only ~4 Hz)
    const tick = () => {
      const r = abRef.current;
      if (r?.b !== undefined && v.currentTime >= r.b) v.currentTime = r.a;
      setT(v.currentTime);
      if (!v.paused) raf = requestAnimationFrame(tick);
    };
    const onPlay = () => {
      setPlaying(true);
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };
    const onPause = () => {
      setPlaying(false);
      cancelAnimationFrame(raf);
    };
    const onTime = () => setT(v.currentTime);
    const onMeta = () => {
      setDur(Number.isFinite(v.duration) ? v.duration : 0);
      if (startAt && v.readyState >= 1 && v.currentTime === 0) v.currentTime = startAt;
    };
    const onRate = () => setRate(v.playbackRate);
    const onVol = () => setMuted(v.muted);
    const events: [string, () => void][] = [
      ["play", onPlay],
      ["pause", onPause],
      ["seeked", onTime],
      ["timeupdate", onTime],
      ["loadedmetadata", onMeta],
      ["ratechange", onRate],
      ["volumechange", onVol],
    ];
    events.forEach(([k, f]) => v.addEventListener(k, f));
    onMeta();
    onVol();
    if (!v.paused) onPlay(); // autoplay may have started before this effect attached
    return () => {
      cancelAnimationFrame(raf);
      events.forEach(([k, f]) => v.removeEventListener(k, f));
    };
  }, [videoRef, startAt, resetKey]);

  useEffect(() => {
    const onFs = () => setFull(!!stage && document.fullscreenElement === stage);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, [stage]);

  const v = () => videoRef.current;

  function togglePlay() {
    const el = v();
    if (!el) return;
    if (el.paused) el.play().catch(() => {});
    else el.pause();
  }
  function step(frames: number) {
    const el = v();
    if (!el) return;
    el.pause();
    el.currentTime = Math.min(Math.max(el.currentTime + frames / FPS, 0), el.duration || Infinity);
    setT(el.currentTime);
  }
  function setSpeed(s: number) {
    const el = v();
    if (el) el.playbackRate = s;
    setRate(s);
  }
  function nextWheelSpeed() {
    const cur = v()?.playbackRate ?? rate;
    const i = WHEEL_SPEEDS.indexOf(cur);
    setSpeed(i < 0 ? 1 : WHEEL_SPEEDS[(i + 1) % WHEEL_SPEEDS.length]);
  }
  function toggleLoop() {
    const el = v();
    if (el) el.loop = !loop;
    setLoop(!loop);
  }
  function toggleMute() {
    const el = v();
    if (el) el.muted = !muted;
    setMuted(!muted);
  }
  function toggleFull() {
    if (document.fullscreenElement) return void document.exitFullscreen().catch(() => {});
    if (stage?.requestFullscreen) return void stage.requestFullscreen().catch(() => {});
    // iPhone Safari can't fullscreen a div, only the <video> itself (native player, no filters)
    (v() as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null)?.webkitEnterFullscreen?.();
  }
  function download() {
    // same-origin route, so `download` is honoured (ignored on the cross-origin CDN URL); extension from the CDN file
    const ext = /\.\w+$/.exec(new URL(v()?.currentSrc || "x:/", location.href).pathname)?.[0] ?? "";
    const a = document.createElement("a");
    a.href = o.fileUrl;
    a.download = o.name + ext;
    a.click();
  }
  function markAb() {
    const now = v()?.currentTime ?? 0;
    if (!ab) setAb({ a: now });
    else if (ab.b === undefined && now > ab.a) setAb({ ...ab, b: now });
    else setAb(null);
  }
  async function grab(then: "save" | "post") {
    const el = v();
    if (!el || capture === "busy") return;
    const at = el.currentTime;
    el.pause();
    setCapture("busy");
    try {
      const blob = await grabFrame(o.fileUrl, at, o.filter, o.view, o.crop);
      const fileName = `${o.name}_${formatMoment(at).replace(/[:.]/g, "-")}.png`;
      if (then === "post") o.onPost(new File([blob], fileName, { type: "image/png" }), at);
      else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = fileName;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      }
      setCapture("idle");
    } catch {
      setCapture("failed");
    }
  }

  // Shortcuts (Doc owns ←/→ file nav, Esc, and the look/lens/turn keys).
  const act = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    act.current = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping()) return;
      const k = e.key.toLowerCase();
      // a focused <video> already toggles on Space itself
      if ((k === " " && (document.activeElement as HTMLElement | null)?.tagName !== "VIDEO") || k === "k") togglePlay();
      else if (k === "," || k === ".") step(k === "," ? -1 : 1);
      else if (k === "[" || k === "]") setSpeed(SPEEDS[Math.min(SPEEDS.length - 1, Math.max(0, SPEEDS.indexOf(rate) + (k === "[" ? -1 : 1)))]);
      else if (k === "a") markAb();
      else if (k === "m") toggleMute();
      else if (k === "c") void grab("save");
      else return;
      e.preventDefault();
    };
  });
  useEffect(() => {
    if (!o.keys) return;
    const h = (e: KeyboardEvent) => act.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [o.keys]);

  return {
    t, dur, playing, rate, loop, muted, ab, capture, full,
    now: () => v()?.currentTime ?? t,
    seek: (to: number) => {
      const el = v();
      if (el) el.currentTime = to;
      setT(to);
    },
    togglePlay, step, setSpeed, nextWheelSpeed, toggleLoop, toggleMute, toggleFull, markAb, grab, download,
  };
}
```

- [ ] **Step 4: Run the hook test**

Run: `cd web && npx vitest run src/tests/videoTransport.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Make `VideoTransport` render from the hook (same markup as today)**

In `web/src/components/VideoTools.tsx`:
1. Delete the `FPS`, `SPEEDS`, `frameOf`, `grabFrame` and `isTyping` definitions and the whole body of `VideoTransport` above its `return` (state, effects, handlers, shortcut effects, `abLabel`).
2. Add `import { SPEEDS, abLabel, frameOf } from "../lib/useVideoTransport";` and `import type { Transport } from "../lib/useVideoTransport";`; drop now-unused imports (`useEffect`, `useRef`, `useState` if unused, `renderPng`, `VideoCrop`, `MediaView` if unused). `KeyMoments` and `VideoLens` keep their own imports.
3. Replace the signature with:

```tsx
export function VideoTransport({
  transport: tr,
  onShare,
  speedSlot,
}: {
  transport: Transport;
  onShare: (t: number) => void;
  /** Where speed + loop render (MediaToolbar's Adjust panel); null while it's closed. Removed in Task 8. */
  speedSlot?: HTMLElement | null;
}) {
  const ab = tr.ab;
  return (
```
4. In the JSX, replace: `t` → `tr.t`, `dur` → `tr.dur`, `playing` → `tr.playing`, `rate` → `tr.rate`, `loop` → `tr.loop`, `muted` → `tr.muted`, `capture` → `tr.capture`, `full` → `tr.full`; handlers `togglePlay` → `tr.togglePlay`, `step(-1)`/`step(1)` → `tr.step(-1)`/`tr.step(1)`, `speed(s)` → `tr.setSpeed(s)`, `toggleMute` → `tr.toggleMute`, `toggleFull` → `tr.toggleFull`, `download` → `tr.download`, `markAb` → `tr.markAb`, `grab(...)` → `tr.grab(...)`; the seek `onChange` becomes `onChange={(e) => tr.seek(Number(e.target.value))}`; the loop button `onClick` becomes `onClick={tr.toggleLoop}`; `abLabel` becomes `abLabel(ab)`; the link button `onClick` becomes `onClick={() => onShare(tr.now())}`.

- [ ] **Step 6: Call the hook from Doc**

In `web/src/screens/Doc.tsx`, add `import { useVideoTransport } from "../lib/useVideoTransport";`. Directly after the line `const panelMedia = recordMedia(detail, isDesktop).media;` add:

```tsx
  // Video state lives here (not in VideoTransport) so the playback row and the media console share it.
  const transport = useVideoTransport({
    videoRef,
    crop: recordMedia(detail, isDesktop).crop,
    fileUrl: `/api/file/${id}`,
    name: id,
    filter: adjustFilter(adjust),
    view,
    startAt: parseMoment(searchParams.get("t")) ?? undefined,
    keys: panelMedia === "video" && !(composer || viewer),
    onPost: (frame, t) => handlePostFrame(frame, t),
    stage: panel,
    resetKey: id,
  });
```
and replace the `<VideoTransport key={id} … />` element with:

```tsx
        <VideoTransport transport={transport} onShare={handleShare} speedSlot={speedSlot} />
```

- [ ] **Step 7: Run the whole suite and the type check**

Run: `cd web && npx tsc --noEmit -p . && npx vitest run`
Expected: no type errors; all tests PASS (the existing Doc video tests prove the UI is unchanged).

- [ ] **Step 8: Commit**

```bash
git add web/src/lib/useVideoTransport.ts web/src/tests/videoTransport.test.tsx web/src/components/VideoTools.tsx web/src/screens/Doc.tsx
git commit -m "refactor(web): lift video transport state into useVideoTransport

Shared by the playback row and (next) the media console; resetKey clears
A-B, loop and capture on another file.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Fader and Knob

**Files:**
- Create: `web/src/components/console/Fader.tsx`, `web/src/components/console/Knob.tsx`
- Test: `web/src/tests/consoleParts.test.tsx`

**Interfaces:**
- Produces: `Fader({ label, Icon, value, onChange }: { label: string; Icon: LucideIcon; value: number; onChange: (v: number) => void })` (range 0–200, double-tap → 100); `Knob({ label, values, value, onChange }: { label: string; values: readonly number[]; value: number; onChange: (v: number) => void })`.

- [ ] **Step 1: Write the failing test**

```tsx
// web/src/tests/consoleParts.test.tsx
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Sun } from "lucide-react";
import { Fader } from "../components/console/Fader";
import { Knob } from "../components/console/Knob";

describe("Fader", () => {
  it("slides 0–200 and a double tap goes back to 100", () => {
    const onChange = vi.fn();
    render(<Fader label="Brightness" Icon={Sun} value={140} onChange={onChange} />);
    const f = screen.getByLabelText("Brightness");
    expect(f).toHaveAttribute("min", "0");
    expect(f).toHaveAttribute("max", "200");
    fireEvent.change(f, { target: { value: "60" } });
    expect(onChange).toHaveBeenLastCalledWith(60);
    fireEvent.pointerUp(f);
    fireEvent.pointerUp(f);
    expect(onChange).toHaveBeenLastCalledWith(100);
  });
});

describe("Knob", () => {
  const values = [2, 3, 5, 8];
  it("arrow keys step, clamped at the ends", () => {
    const onChange = vi.fn();
    render(<Knob label="Magnifier strength" values={values} value={3} onChange={onChange} />);
    const k = screen.getByRole("slider", { name: "Magnifier strength" });
    expect(k).toHaveAttribute("aria-valuetext", "3×");
    fireEvent.keyDown(k, { key: "ArrowUp" });
    expect(onChange).toHaveBeenLastCalledWith(5);
    fireEvent.keyDown(k, { key: "ArrowDown" });
    expect(onChange).toHaveBeenLastCalledWith(2);
  });

  it("a tap cycles (wrapping), a drag up steps by 24px", () => {
    const onChange = vi.fn();
    const { rerender } = render(<Knob label="Magnifier strength" values={values} value={8} onChange={onChange} />);
    const k = screen.getByRole("slider");
    fireEvent.pointerDown(k, { clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(k, { clientY: 100, pointerId: 1 });
    expect(onChange).toHaveBeenLastCalledWith(2); // wraps
    rerender(<Knob label="Magnifier strength" values={values} value={2} onChange={onChange} />);
    onChange.mockClear();
    fireEvent.pointerDown(k, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(k, { clientY: 50, pointerId: 1 });
    fireEvent.pointerUp(k, { clientY: 50, pointerId: 1 });
    expect(onChange).toHaveBeenLastCalledWith(5); // 50px up = 2 steps
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/tests/consoleParts.test.tsx`
Expected: FAIL with "Failed to resolve import "../components/console/Fader""

- [ ] **Step 3: Write the components**

```tsx
// web/src/components/console/Fader.tsx
// A long control for a long value: a vertical synth fader (native range
// input turned upright, so keyboards and screen readers work as usual).
// A double tap puts it back to 100.
import { useRef } from "react";
import type { LucideIcon } from "lucide-react";

export function Fader({ label, Icon, value, onChange }: { label: string; Icon: LucideIcon; value: number; onChange: (v: number) => void }) {
  const lastUp = useRef(0);
  return (
    <label title={`${label} (double-tap to reset)`} className="flex h-full min-h-0 flex-col items-center gap-1.5">
      <input
        type="range"
        aria-label={label}
        min={0}
        max={200}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={() => {
          const now = Date.now();
          if (now - lastUp.current < 300) onChange(100);
          lastUp.current = now;
        }}
        className="min-h-0 w-9 flex-1 cursor-pointer accent-[var(--signal)] [direction:rtl] [writing-mode:vertical-lr]"
      />
      <Icon size={16} strokeWidth={1.75} aria-hidden="true" className="text-dim" />
      <span className="font-mono text-[10px] tabular-nums text-faint">{value}</span>
    </label>
  );
}
```

```tsx
// web/src/components/console/Knob.tsx
// A round control for a stepped value, drawn like a max bill dial: a quiet
// face, hairline ticks at each step, one thin needle, the value small in
// the middle. Drag up/down to turn, tap to step on (wrapping), arrows too.
import { useRef } from "react";

const SPAN = 240; // degrees the needle sweeps, centred on 12 o'clock

export function Knob({ label, values, value, onChange }: { label: string; values: readonly number[]; value: number; onChange: (v: number) => void }) {
  const i = Math.max(0, values.indexOf(value));
  const drag = useRef<{ y: number; i: number; moved: boolean } | null>(null);
  const to = (j: number) => onChange(values[Math.min(values.length - 1, Math.max(0, j))]);
  const angleOf = (j: number) => -SPAN / 2 + (SPAN * j) / Math.max(1, values.length - 1);
  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={label}
      title={`${label}: drag up or down, or tap`}
      aria-valuemin={values[0]}
      aria-valuemax={values[values.length - 1]}
      aria-valuenow={values[i]}
      aria-valuetext={`${values[i]}×`}
      onKeyDown={(e) => {
        const d = e.key === "ArrowUp" || e.key === "ArrowRight" ? 1 : e.key === "ArrowDown" || e.key === "ArrowLeft" ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        to(i + d);
      }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        drag.current = { y: e.clientY, i, moved: false };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const dy = d.y - e.clientY;
        if (Math.abs(dy) > 4) d.moved = true;
        if (d.moved) to(d.i + Math.trunc(dy / 24));
      }}
      onPointerUp={() => {
        const d = drag.current;
        drag.current = null;
        if (d && !d.moved) onChange(values[(i + 1) % values.length]);
      }}
      onPointerCancel={() => (drag.current = null)}
      className="relative grid size-14 shrink-0 cursor-grab touch-none select-none place-items-center rounded-full border border-line2 bg-surface outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--signal)]"
    >
      {values.map((_, j) => (
        <span
          key={j}
          aria-hidden="true"
          className="absolute left-1/2 top-[3px] h-[5px] w-px bg-line2"
          style={{ transformOrigin: "50% 25px", transform: `translateX(-50%) rotate(${angleOf(j)}deg)` }}
        />
      ))}
      <span
        aria-hidden="true"
        className="absolute left-1/2 top-[9px] h-[13px] w-[2px] rounded-full bg-signal transition-transform duration-150 ease-out motion-reduce:transition-none"
        style={{ transformOrigin: "50% 19px", transform: `translateX(-50%) rotate(${angleOf(i)}deg)` }}
      />
      <span className="font-mono text-[10px] text-ink">{values[i]}×</span>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/tests/consoleParts.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add web/src/components/console/Fader.tsx web/src/components/console/Knob.tsx web/src/tests/consoleParts.test.tsx
git commit -m "feat(web): console fader (vertical, double-tap reset) and max-bill-style knob

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Click wheel

**Files:**
- Create: `web/src/components/console/ClickWheel.tsx`
- Test: `web/src/tests/clickWheel.test.tsx`

**Interfaces:**
- Produces: `TAP_DEG = 6`; `type WheelZone = "centre" | "top" | "right" | "bottom" | "left"`; `interface WheelPress { label: string; content: ReactNode; onPress: () => void; on?: boolean }`; `ClickWheel({ label, valueText, stepDeg, onStep, presses }: { label: string; valueText: string; stepDeg: number; onStep: (n: number) => void; presses: Record<WheelZone, WheelPress> })`. Clockwise = positive steps.

- [ ] **Step 1: Write the failing test**

```tsx
// web/src/tests/clickWheel.test.tsx
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ClickWheel } from "../components/console/ClickWheel";
import type { WheelPress, WheelZone } from "../components/console/ClickWheel";

const R = 60; // test radius on a 136px wheel whose centre is (68, 68)
const at = (deg: number, r = R) => ({ clientX: 68 + r * Math.cos((deg * Math.PI) / 180), clientY: 68 + r * Math.sin((deg * Math.PI) / 180), pointerId: 1 });

function setup() {
  const onStep = vi.fn();
  const presses = Object.fromEntries(
    (["centre", "top", "right", "bottom", "left"] as WheelZone[]).map((z) => [z, { label: z, content: z, onPress: vi.fn() } satisfies WheelPress]),
  ) as Record<WheelZone, WheelPress & { onPress: ReturnType<typeof vi.fn> }>;
  render(<ClickWheel label="Frames" valueText="0:02.00" stepDeg={12} onStep={onStep} presses={presses} />);
  const ring = screen.getByRole("slider", { name: "Frames" });
  ring.getBoundingClientRect = () => ({ left: 0, top: 0, width: 136, height: 136, right: 136, bottom: 136, x: 0, y: 0, toJSON: () => ({}) });
  const steps = () => onStep.mock.calls.reduce((s, [n]) => s + n, 0);
  const slide = (from: number, to: number) => {
    fireEvent.pointerDown(ring, at(from));
    const dir = Math.sign(to - from);
    for (let d = from + 6 * dir; dir > 0 ? d <= to : d >= to; d += 6 * dir) fireEvent.pointerMove(ring, at(d));
    fireEvent.pointerUp(ring, at(to));
  };
  return { ring, presses, onStep, steps, slide };
}

describe("ClickWheel", () => {
  it("sliding clockwise 30° = 2 steps of 12°; anticlockwise is negative; no press fires", () => {
    const w = setup();
    w.slide(-90, -60);
    expect(w.steps()).toBe(2);
    w.onStep.mockClear();
    w.slide(-60, -90);
    expect(w.steps()).toBeLessThan(0);
    expect(w.presses.top.onPress).not.toHaveBeenCalled();
  });

  it("crossing the ±180° seam doesn't jump", () => {
    const w = setup();
    w.slide(168, 198); // 198° is drawn as -162° by atan2
    expect(w.steps()).toBe(2);
  });

  it("a tap or a small wobble is a press on that place", () => {
    const w = setup();
    fireEvent.pointerDown(w.ring, at(-90));
    fireEvent.pointerUp(w.ring, at(-90));
    expect(w.presses.top.onPress).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(w.ring, at(0));
    fireEvent.pointerMove(w.ring, at(4));
    fireEvent.pointerUp(w.ring, at(4));
    expect(w.presses.right.onPress).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(w.ring, at(0, 5));
    fireEvent.pointerUp(w.ring, at(0, 5));
    expect(w.presses.centre.onPress).toHaveBeenCalledTimes(1);
    expect(w.onStep).not.toHaveBeenCalled();
  });

  it("a cancelled pointer ends the gesture without a press", () => {
    const w = setup();
    fireEvent.pointerDown(w.ring, at(90));
    fireEvent.pointerCancel(w.ring, at(90));
    fireEvent.pointerUp(w.ring, at(90));
    expect(w.presses.bottom.onPress).not.toHaveBeenCalled();
  });

  it("keyboard: arrows step the ring; the five places are buttons (keyboard click presses, mouse click is left to the ring)", () => {
    const w = setup();
    fireEvent.keyDown(w.ring, { key: "ArrowRight" });
    fireEvent.keyDown(w.ring, { key: "ArrowLeft" });
    expect(w.onStep.mock.calls.map(([n]) => n)).toEqual([1, -1]);
    const left = screen.getByRole("button", { name: "left" });
    fireEvent.click(left, { detail: 0 });
    expect(w.presses.left.onPress).toHaveBeenCalledTimes(1);
    fireEvent.click(left, { detail: 1 });
    expect(w.presses.left.onPress).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/tests/clickWheel.test.tsx`
Expected: FAIL with "Failed to resolve import "../components/console/ClickWheel""

- [ ] **Step 3: Write the component**

```tsx
// web/src/components/console/ClickWheel.tsx
// iPod-style click wheel, drawn like a max bill dial. Slide round the ring
// to turn it (`onStep` gets whole steps of `stepDeg`, clockwise positive),
// or press one of five places: centre, top, right, bottom, left. A touch
// that travels less than TAP_DEG is a press, more is a turn. The ring is a
// slider for keyboards (arrows = one step); the five places are real
// buttons too, so keyboards and screen readers reach them. A mouse/touch
// click on a button is left to the ring (it already handled the press).
import { useRef } from "react";
import type { ReactNode } from "react";

export const TAP_DEG = 6;
export type WheelZone = "centre" | "top" | "right" | "bottom" | "left";
export interface WheelPress {
  label: string;
  content: ReactNode;
  onPress: () => void;
  on?: boolean;
}

const SIZE = 136; // px
const HUB = 0.38; // the centre button, share of the wheel's radius
const POS: Record<Exclude<WheelZone, "centre">, string> = {
  top: "left-1/2 top-1 -translate-x-1/2",
  right: "right-1 top-1/2 -translate-y-1/2",
  bottom: "bottom-1 left-1/2 -translate-x-1/2",
  left: "left-1 top-1/2 -translate-y-1/2",
};

function polar(e: { clientX: number; clientY: number }, el: Element) {
  const r = el.getBoundingClientRect();
  const dx = e.clientX - (r.left + r.width / 2);
  const dy = e.clientY - (r.top + r.height / 2);
  return { deg: (Math.atan2(dy, dx) * 180) / Math.PI, dist: Math.hypot(dx, dy) / (r.width / 2) };
}
function zoneOf(deg: number, dist: number): WheelZone {
  if (dist < HUB) return "centre";
  if (deg >= -135 && deg < -45) return "top";
  if (deg >= -45 && deg < 45) return "right";
  if (deg >= 45 && deg < 135) return "bottom";
  return "left";
}

export function ClickWheel({
  label,
  valueText,
  stepDeg,
  onStep,
  presses,
}: {
  label: string;
  valueText: string;
  stepDeg: number;
  onStep: (n: number) => void;
  presses: Record<WheelZone, WheelPress>;
}) {
  const g = useRef<{ zone: WheelZone; last: number; acc: number; travel: number } | null>(null);
  const end = () => (g.current = null);
  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuetext={valueText}
      title={`${label}: slide round the ring`}
      onKeyDown={(e) => {
        const d = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        onStep(d);
      }}
      onPointerDown={(e) => {
        const p = polar(e, e.currentTarget);
        e.currentTarget.setPointerCapture?.(e.pointerId);
        g.current = { zone: zoneOf(p.deg, p.dist), last: p.deg, acc: 0, travel: 0 };
      }}
      onPointerMove={(e) => {
        const s = g.current;
        if (!s) return;
        const p = polar(e, e.currentTarget);
        let d = p.deg - s.last;
        if (d > 180) d -= 360; // the ±180° seam
        if (d < -180) d += 360;
        s.last = p.deg;
        s.travel += Math.abs(d);
        if (s.travel <= TAP_DEG) return; // still a press
        s.acc += d;
        const n = Math.trunc(s.acc / stepDeg);
        if (n) {
          s.acc -= n * stepDeg;
          onStep(n);
        }
      }}
      onPointerUp={() => {
        const s = g.current;
        end();
        if (s && s.travel <= TAP_DEG) presses[s.zone].onPress();
      }}
      onPointerCancel={end}
      onLostPointerCapture={end}
      className="relative shrink-0 cursor-grab touch-none select-none rounded-full border border-line2 bg-surface outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--signal)]"
      style={{ width: SIZE, height: SIZE }}
    >
      {/* max bill face: 12 hairline ticks */}
      {Array.from({ length: 12 }, (_, k) => (
        <span
          key={k}
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-[2px] h-[5px] w-px bg-line2"
          style={{ transformOrigin: `50% ${SIZE / 2 - 2}px`, transform: `translateX(-50%) rotate(${k * 30}deg)` }}
        />
      ))}
      {(["top", "right", "bottom", "left"] as const).map((z) => (
        <button
          key={z}
          type="button"
          aria-label={presses[z].label}
          title={presses[z].label}
          aria-pressed={presses[z].on}
          onClick={(e) => e.detail === 0 && presses[z].onPress()}
          className={`absolute grid size-9 place-items-center rounded-full font-mono text-[11px] ${presses[z].on ? "text-signal" : "text-dim"} ${POS[z]}`}
        >
          {presses[z].content}
        </button>
      ))}
      <button
        type="button"
        aria-label={presses.centre.label}
        title={presses.centre.label}
        onClick={(e) => e.detail === 0 && presses.centre.onPress()}
        className="absolute left-1/2 top-1/2 grid size-[52px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-line2 bg-bg2 text-ink transition-transform duration-150 ease-out active:scale-95 motion-reduce:transition-none"
      >
        {presses.centre.content}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/tests/clickWheel.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add web/src/components/console/ClickWheel.tsx web/src/tests/clickWheel.test.tsx
git commit -m "feat(web): iPod-style click wheel (turn vs press, seam-safe, keyboard)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Pads model, arrange mode, PadGrid and Keyboard

**Files:**
- Create: `web/src/components/console/types.ts`, `web/src/components/console/pads.tsx`, `web/src/components/console/PadGrid.tsx`, `web/src/components/console/Keyboard.tsx`
- Modify: `web/src/lib/mediaView.ts` (add `turned`)
- Test: `web/src/tests/pads.test.tsx`, `web/src/tests/mediaView.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 3, 4 (`isEffectOn`, `toggleEffect`, `EffectId`, `PadOrder`, `ToolId`, `moveItem`, `Transport`).
- Produces:

```ts
// lib/mediaView.ts
export const turned: (v: MediaView) => MediaView; // a quarter turn clockwise, zoom/pan reset, flip kept
// console/types.ts
export interface MediaControls {
  media: "image" | "video";
  adjust: ImageAdjust; setAdjust(a: ImageAdjust): void;
  compare: boolean; setCompare(on: boolean): void;
  lens: boolean; setLens(on: boolean): void;
  mag: number; setMag(m: number): void;
  view: MediaView; setView(v: MediaView): void; zoomBy(f: number): void;
  ruler: boolean; setRuler(on: boolean): void;
  motion: boolean; setMotion(on: boolean): void;
  savePicture(): Promise<void>; // image only; video saves through transport.grab
  transport: Transport | null; // video only
}
export type PadKind = "toggle" | "momentary" | "action";
export interface Pad { id: string; label: string; Icon: LucideIcon; kind: PadKind; on: boolean; busy?: boolean; failed?: boolean; press(down?: boolean): void }
export interface PadSet { effects: Pad[]; tools: Pad[] }
export interface BodyProps { c: MediaControls; pads: PadSet; arranging: boolean; reorder(group: "effects" | "tools", ids: string[]): void; presetName: string | null }
// console/pads.tsx
export function usePads(c: MediaControls, order: PadOrder): PadSet;
export function padHandlers(p: Pad, arranging: boolean): Record<string, unknown>;
export function useArrange(group: "effects" | "tools", ids: string[], onReorder: (ids: string[]) => void, enabled: boolean): (id: string) => Record<string, unknown>;
export const raised: string; export const sunk: string; // shared physical-state classes
// console/PadGrid.tsx
export function PadGrid(props: { pads: Pad[]; group: "effects" | "tools"; variant: "chip" | "pad"; arranging: boolean; reorder: BodyProps["reorder"] }): JSX.Element;
// console/Keyboard.tsx
export function Keyboard(props: { pads: PadSet; arranging: boolean; reorder: BodyProps["reorder"] }): JSX.Element;
```

- [ ] **Step 1: Write the failing tests**

Append to `web/src/tests/mediaView.test.ts` (inside the existing `describe`):

```ts
  it("turned: a quarter turn clockwise, zoom and pan reset, mirror kept", () => {
    expect(turned({ z: 3, x: 10, y: -4, rot: 270, flip: true })).toEqual({ z: 1, x: 0, y: 0, rot: 0, flip: true });
    expect(turned(DEFAULT_VIEW).rot).toBe(90);
  });
```
(and add `turned` to that file's import from `../lib/mediaView`).

```tsx
// web/src/tests/pads.test.tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DEFAULT_ADJUST } from "../components/ImageTools";
import { DEFAULT_VIEW } from "../lib/mediaView";
import { defaultOrder } from "../lib/consolePrefs";
import { usePads } from "../components/console/pads";
import { PadGrid } from "../components/console/PadGrid";
import { Keyboard } from "../components/console/Keyboard";
import type { MediaControls } from "../components/console/types";

function controls(over: Partial<MediaControls> = {}): MediaControls {
  return {
    media: "image", adjust: DEFAULT_ADJUST, setAdjust: vi.fn(), compare: false, setCompare: vi.fn(), lens: false, setLens: vi.fn(),
    mag: 3, setMag: vi.fn(), view: DEFAULT_VIEW, setView: vi.fn(), zoomBy: vi.fn(), ruler: false, setRuler: vi.fn(),
    motion: false, setMotion: vi.fn(), savePicture: vi.fn().mockResolvedValue(undefined), transport: null, ...over,
  };
}

function Harness({ c, arranging = false, reorder = vi.fn(), kind = "grid" }: { c: MediaControls; arranging?: boolean; reorder?: (g: "effects" | "tools", ids: string[]) => void; kind?: "grid" | "keys" }) {
  const pads = usePads(c, defaultOrder());
  return kind === "keys" ? (
    <Keyboard pads={pads} arranging={arranging} reorder={reorder} />
  ) : (
    <>
      <PadGrid pads={pads.effects} group="effects" variant="pad" arranging={arranging} reorder={reorder} />
      <PadGrid pads={pads.tools} group="tools" variant="pad" arranging={arranging} reorder={reorder} />
    </>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("pads", () => {
  it("effect pads toggle the look; Original works only while held", () => {
    const c = controls();
    render(<Harness c={c} />);
    fireEvent.click(screen.getByRole("button", { name: "Night" }));
    expect(c.setAdjust).toHaveBeenCalledWith(expect.objectContaining({ gamma: 170, contrast: 110 }));
    const original = screen.getByRole("button", { name: "Hold to see the original" });
    fireEvent.pointerDown(original, { pointerId: 1 });
    expect(c.setCompare).toHaveBeenLastCalledWith(true);
    fireEvent.pointerUp(original, { pointerId: 1 });
    expect(c.setCompare).toHaveBeenLastCalledWith(false);
  });

  it("an image shows ruler, turn and save picture; a video adds motion, post, download and saves a frame", () => {
    const { unmount } = render(<Harness c={controls()} />);
    const tools = () => screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"));
    expect(tools()).toEqual(expect.arrayContaining(["Ruler", "Turn", "Save picture"]));
    expect(tools()).not.toContain("Motion");
    unmount();
    const grab = vi.fn().mockResolvedValue(undefined);
    const transport = { capture: "idle", grab, download: vi.fn() } as unknown as MediaControls["transport"];
    render(<Harness c={controls({ media: "video", transport })} />);
    expect(tools()).toEqual(expect.arrayContaining(["Motion", "Save frame", "Post frame to discussion", "Download video"]));
    fireEvent.click(screen.getByRole("button", { name: "Save frame" }));
    expect(grab).toHaveBeenCalledWith("save");
  });

  it("saving a picture shows busy, then failed with a retry label", async () => {
    const savePicture = vi.fn().mockRejectedValue(new Error("x"));
    render(<Harness c={controls({ savePicture })} />);
    fireEvent.click(screen.getByRole("button", { name: "Save picture" }));
    expect(await screen.findByRole("button", { name: "Save failed, try again" })).toBeInTheDocument();
  });

  it("turn pad turns a quarter", () => {
    const c = controls();
    render(<Harness c={c} />);
    fireEvent.click(screen.getByRole("button", { name: "Turn" }));
    expect(c.setView).toHaveBeenCalledWith(expect.objectContaining({ rot: 90 }));
  });

  it("arrange mode: drag onto another pad of the same group reorders; other group ignored; presses off", () => {
    const reorder = vi.fn();
    const c = controls();
    render(<Harness c={c} arranging reorder={reorder} />);
    const night = screen.getByRole("button", { name: "Night" });
    const enhance = screen.getByRole("button", { name: "Enhance" });
    const ruler = screen.getByRole("button", { name: "Ruler" });
    const over = vi.spyOn(document, "elementFromPoint");
    fireEvent.pointerDown(night, { pointerId: 1, clientX: 0, clientY: 0 });
    over.mockReturnValue(ruler);
    fireEvent.pointerMove(night, { pointerId: 1, clientX: 5, clientY: 5 });
    expect(reorder).not.toHaveBeenCalled(); // tools group: ignored
    over.mockReturnValue(enhance);
    fireEvent.pointerMove(night, { pointerId: 1, clientX: 9, clientY: 9 });
    expect(reorder).toHaveBeenCalledWith("effects", ["night", "enhance", "invert", "bw", "ironbow", "rainbow", "sharpen", "original"]);
    fireEvent.pointerUp(night, { pointerId: 1 });
    fireEvent.click(night);
    expect(c.setAdjust).not.toHaveBeenCalled();
  });

  it("outside arrange mode a drag never reorders", () => {
    const reorder = vi.fn();
    render(<Harness c={controls()} reorder={reorder} />);
    const night = screen.getByRole("button", { name: "Night" });
    vi.spyOn(document, "elementFromPoint").mockReturnValue(screen.getByRole("button", { name: "Enhance" }));
    fireEvent.pointerDown(night, { pointerId: 1 });
    fireEvent.pointerMove(night, { pointerId: 1, clientX: 30 });
    fireEvent.pointerUp(night, { pointerId: 1 });
    expect(reorder).not.toHaveBeenCalled();
  });

  it("keyboard: 8 white keys (effects) and black keys for the tools; at least 36px", () => {
    render(<Harness c={controls()} kind="keys" />);
    expect(document.querySelectorAll("[data-key=white]")).toHaveLength(8);
    expect(document.querySelectorAll("[data-key=black]")).toHaveLength(3); // image: ruler, turn, save
    const black = document.querySelector("[data-key=black]") as HTMLElement;
    expect(black.className).toContain("h-9");
    expect(black.className).toContain("min-w-9");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run src/tests/pads.test.tsx src/tests/mediaView.test.ts`
Expected: FAIL ("turned" is not exported; "../components/console/pads" cannot be resolved)

- [ ] **Step 3: Add `turned` to `web/src/lib/mediaView.ts`** (append):

```ts
/** A quarter turn clockwise; zoom and pan start over, the mirror stays. */
export const turned = (v: MediaView): MediaView => ({ ...DEFAULT_VIEW, flip: v.flip, rot: ((v.rot + 90) % 360) as MediaView["rot"] });
```

- [ ] **Step 4: Write `types.ts`**

```ts
// web/src/components/console/types.ts
import type { LucideIcon } from "lucide-react";
import type { ImageAdjust } from "../ImageTools";
import type { MediaView } from "../../lib/mediaView";
import type { Transport } from "../../lib/useVideoTransport";

/** Everything the media console reads and drives; Doc builds it each render. */
export interface MediaControls {
  media: "image" | "video";
  adjust: ImageAdjust;
  setAdjust(a: ImageAdjust): void;
  compare: boolean;
  setCompare(on: boolean): void;
  lens: boolean;
  setLens(on: boolean): void;
  mag: number;
  setMag(m: number): void;
  view: MediaView;
  setView(v: MediaView): void;
  zoomBy(f: number): void;
  ruler: boolean;
  setRuler(on: boolean): void;
  motion: boolean;
  setMotion(on: boolean): void;
  /** Image: save the picture as seen. Video frames go through transport.grab. */
  savePicture(): Promise<void>;
  transport: Transport | null;
}

export type PadKind = "toggle" | "momentary" | "action";
export interface Pad {
  id: string;
  label: string;
  Icon: LucideIcon;
  kind: PadKind;
  on: boolean;
  busy?: boolean;
  failed?: boolean;
  press(down?: boolean): void;
}
export interface PadSet {
  effects: Pad[];
  tools: Pad[];
}
export interface BodyProps {
  c: MediaControls;
  pads: PadSet;
  arranging: boolean;
  reorder(group: "effects" | "tools", ids: string[]): void;
  presetName: string | null;
}
```

- [ ] **Step 5: Write `pads.tsx`**

```tsx
// web/src/components/console/pads.tsx
// The pads every console style shares, in the visitor's order: effects
// (looks, heat colours, sharpen, Original) and tools (ruler, motion, turn,
// save, post, download). Video-only tools are left out on images. Also the
// press handling (Original works while held) and arrange-mode dragging.
import { useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Activity, Camera, Download, DropletOff, Eye, Flame, Focus, ImageDown, LoaderCircle, MessageSquarePlus, MoonStar, Rainbow, Ruler, RotateCw, SunMoon, TriangleAlert, WandSparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { isEffectOn, toggleEffect } from "../../lib/mediaEffects";
import type { EffectId } from "../../lib/mediaEffects";
import type { PadOrder, ToolId } from "../../lib/consolePrefs";
import { moveItem } from "../../lib/consolePrefs";
import { turned } from "../../lib/mediaView";
import type { MediaControls, Pad, PadSet } from "./types";

/** Physical state: raised (thick bottom edge) or sunk 2px and lit. */
export const raised = "border-line2 border-b-[3px] text-dim";
export const sunk = "translate-y-[2px] border-signal border-b text-signal bg-[color-mix(in_srgb,var(--signal)_14%,transparent)]";

const EFFECTS: Record<EffectId, { label: string; Icon: LucideIcon }> = {
  enhance: { label: "Enhance", Icon: WandSparkles },
  invert: { label: "Invert", Icon: SunMoon },
  bw: { label: "Black and white", Icon: DropletOff },
  night: { label: "Night", Icon: MoonStar },
  ironbow: { label: "Ironbow", Icon: Flame },
  rainbow: { label: "Rainbow", Icon: Rainbow },
  sharpen: { label: "Sharpen", Icon: Focus },
  original: { label: "Hold to see the original", Icon: Eye },
};

export function usePads(c: MediaControls, order: PadOrder): PadSet {
  const [saving, setSaving] = useState<"idle" | "busy" | "failed">("idle");
  const video = c.media === "video";
  const effects: Pad[] = order.effects.map((id) =>
    id === "original"
      ? { id, ...EFFECTS[id], kind: "momentary", on: c.compare, press: (down) => c.setCompare(!!down) }
      : { id, ...EFFECTS[id], kind: "toggle", on: isEffectOn(c.adjust, id), press: () => c.setAdjust(toggleEffect(c.adjust, id)) },
  );
  const cap = video ? (c.transport?.capture ?? "idle") : saving;
  async function savePicture() {
    if (saving === "busy") return;
    setSaving("busy");
    try {
      await c.savePicture();
      setSaving("idle");
    } catch {
      setSaving("failed");
    }
  }
  const tool: Record<ToolId, Omit<Pad, "id"> | null> = {
    ruler: { label: "Ruler", Icon: Ruler, kind: "toggle", on: c.ruler, press: () => c.setRuler(!c.ruler) },
    motion: video ? { label: "Motion", Icon: Activity, kind: "toggle", on: c.motion, press: () => c.setMotion(!c.motion) } : null,
    turn: { label: "Turn", Icon: RotateCw, kind: "action", on: c.view.rot !== 0, press: () => c.setView(turned(c.view)) },
    save: {
      label: cap === "failed" ? "Save failed, try again" : video ? "Save frame" : "Save picture",
      Icon: cap === "busy" ? LoaderCircle : cap === "failed" ? TriangleAlert : video ? Camera : ImageDown,
      kind: "action",
      on: false,
      busy: cap === "busy",
      failed: cap === "failed",
      press: () => void (video ? c.transport?.grab("save") : savePicture()),
    },
    post: video ? { label: "Post frame to discussion", Icon: MessageSquarePlus, kind: "action", on: false, press: () => void c.transport?.grab("post") } : null,
    download: video ? { label: "Download video", Icon: Download, kind: "action", on: false, press: () => c.transport?.download() } : null,
  };
  const tools = order.tools.flatMap((id) => (tool[id] ? [{ id, ...tool[id]! }] : []));
  return { effects, tools };
}

/** Click / hold behaviour for a pad; nothing while arranging (drags move pads then). */
export function padHandlers(p: Pad, arranging: boolean) {
  if (arranging || p.busy) return {};
  if (p.kind !== "momentary") return { onClick: () => p.press() };
  const up = () => p.press(false);
  return {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      e.currentTarget.setPointerCapture?.(e.pointerId);
      p.press(true);
    },
    onPointerUp: up,
    onPointerCancel: up,
    onLostPointerCapture: up,
    onKeyDown: (e: { key: string }) => (e.key === " " || e.key === "Enter") && p.press(true),
    onKeyUp: up,
    onBlur: up,
    onContextMenu: (e: { preventDefault(): void }) => e.preventDefault(),
  };
}

/** Arrange mode: drag a pad onto another of the same group to move it there. */
export function useArrange(group: "effects" | "tools", ids: string[], onReorder: (ids: string[]) => void, enabled: boolean) {
  const drag = useRef<string | null>(null);
  return (id: string) =>
    enabled
      ? {
          "data-arrange-id": id,
          "data-arrange-group": group,
          onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture?.(e.pointerId);
            drag.current = id;
          },
          onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
            const from = drag.current;
            if (!from) return;
            const over = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>(`[data-arrange-group="${group}"]`);
            const to = over?.dataset.arrangeId;
            if (!to || to === from) return;
            const fi = ids.indexOf(from);
            const ti = ids.indexOf(to);
            if (fi >= 0 && ti >= 0) onReorder(moveItem(ids, fi, ti));
          },
          onPointerUp: () => (drag.current = null),
          onPointerCancel: () => (drag.current = null),
        }
      : {};
}
```

- [ ] **Step 6: Write `PadGrid.tsx` and `Keyboard.tsx`**

```tsx
// web/src/components/console/PadGrid.tsx
// Square pads (DJ deck) or chips (Simple): same pads, two sizes. Square
// means press; a pad that is on sinks and lights.
import { padHandlers, raised, sunk, useArrange } from "./pads";
import type { BodyProps, Pad } from "./types";

export function PadGrid({ pads, group, variant, arranging, reorder }: { pads: Pad[]; group: "effects" | "tools"; variant: "chip" | "pad"; arranging: boolean; reorder: BodyProps["reorder"] }) {
  const arrange = useArrange(group, pads.map((p) => p.id), (ids) => reorder(group, ids), arranging);
  const shape =
    variant === "pad"
      ? "h-12 rounded-[8px]"
      : "h-9 min-w-9 rounded-[8px] px-2 [@media(pointer:fine)]:h-8 [@media(pointer:fine)]:min-w-8";
  return (
    <div className={variant === "pad" ? "grid grid-cols-4 gap-2" : "flex flex-wrap gap-2"}>
      {pads.map((p) => (
        <button
          key={p.id}
          type="button"
          aria-label={p.label}
          title={p.label}
          aria-pressed={p.kind === "action" ? undefined : p.on}
          disabled={p.busy}
          {...padHandlers(p, arranging)}
          {...arrange(p.id)}
          className={`inline-flex touch-none select-none items-center justify-center border transition-[transform,background-color] duration-[120ms] ease-out motion-reduce:transition-none ${shape} ${p.on ? sunk : raised} ${p.failed ? "!border-amber !text-amber" : ""} ${arranging ? "cursor-grab border-dashed" : ""} ${p.kind === "momentary" && !arranging ? "border-dashed" : ""}`}
        >
          <p.Icon size={variant === "pad" ? 20 : 18} strokeWidth={1.75} aria-hidden="true" className={p.busy ? "animate-spin" : ""} />
        </button>
      ))}
    </div>
  );
}
```

```tsx
// web/src/components/console/Keyboard.tsx
// The Wakeman keyboard (Walkman style): white keys are the effects, black
// keys the tools, sitting between the white keys like a piano's. Every key
// is at least 36px; a key that is on stays down.
import { padHandlers, useArrange } from "./pads";
import type { BodyProps, PadSet } from "./types";

// piano pattern: a black key after white keys 1, 2, 4, 5, 6, 7 (none after 3 and 8)
const BLACK_AFTER = [1, 2, 4, 5, 6, 7];

export function Keyboard({ pads, arranging, reorder }: { pads: PadSet; arranging: boolean; reorder: BodyProps["reorder"] }) {
  const white = useArrange("effects", pads.effects.map((p) => p.id), (ids) => reorder("effects", ids), arranging);
  const black = useArrange("tools", pads.tools.map((p) => p.id), (ids) => reorder("tools", ids), arranging);
  const n = pads.effects.length;
  return (
    <div className="relative h-[72px] select-none">
      <div className="grid h-full gap-[3px]" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {pads.effects.map((p) => (
          <button
            key={p.id}
            type="button"
            data-key="white"
            aria-label={p.label}
            title={p.label}
            aria-pressed={p.kind === "action" ? undefined : p.on}
            {...padHandlers(p, arranging)}
            {...white(p.id)}
            className={`flex touch-none items-end justify-center rounded-b-[6px] border pb-2 transition-[transform,background-color] duration-[120ms] ease-out motion-reduce:transition-none ${p.on ? "translate-y-[2px] border-b border-signal bg-[color-mix(in_srgb,var(--signal)_14%,transparent)] text-signal" : "border-b-[3px] border-line2 bg-bg2 text-dim"} ${arranging || p.kind === "momentary" ? "border-dashed" : ""}`}
          >
            <p.Icon size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        ))}
      </div>
      {pads.tools.map((p, k) => (
        <button
          key={p.id}
          type="button"
          data-key="black"
          aria-label={p.label}
          title={p.label}
          aria-pressed={p.kind === "action" ? undefined : p.on}
          disabled={p.busy}
          {...padHandlers(p, arranging)}
          {...black(p.id)}
          className={`absolute top-0 z-10 grid h-9 min-w-9 -translate-x-1/2 touch-none place-items-center rounded-b-[6px] transition-[background-color] duration-[120ms] ease-out motion-reduce:transition-none ${p.on ? "bg-signal text-bg" : "bg-ink text-bg"} ${p.failed ? "!bg-amber" : ""} ${arranging ? "outline-dashed outline-1 outline-signal" : ""}`}
          style={{ left: `${(BLACK_AFTER[k] / n) * 100}%`, width: `calc(${100 / n}% * 0.8)` }}
        >
          <p.Icon size={15} strokeWidth={1.75} aria-hidden="true" className={p.busy ? "animate-spin" : ""} />
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd web && npx vitest run src/tests/pads.test.tsx src/tests/mediaView.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add web/src/lib/mediaView.ts web/src/tests/mediaView.test.ts web/src/components/console/types.ts web/src/components/console/pads.tsx web/src/components/console/PadGrid.tsx web/src/components/console/Keyboard.tsx web/src/tests/pads.test.tsx
git commit -m "feat(web): console pads (effects, tools), arrange mode, pad grid and Wakeman keyboard

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: MediaConsole with the Simple style (replaces MediaToolbar)

**Files:**
- Create: `web/src/components/console/MediaConsole.tsx`, `web/src/components/console/SimpleBody.tsx`, `web/src/components/console/bodies.ts`, `web/src/components/console/sliders.ts`
- Modify: `web/src/screens/Doc.tsx`, `web/src/components/VideoTools.tsx`, `web/src/components/ImageTools.tsx`, `web/src/components/MediaHelp.tsx` (prop only)
- Test: `web/src/tests/doc.test.tsx`, `web/src/tests/mediaConsole.test.tsx`

**Interfaces:**
- Consumes: Tasks 1–7.
- Produces: `MediaConsole({ c, touch, onLink, linkLabel, toast, keys }: { c: MediaControls; touch: boolean; onLink: () => void; linkLabel: string; toast: (m: string) => void; keys: boolean })`; `BODIES: { id: Skin; name: string; Icon: LucideIcon; Body: (p: BodyProps) => JSX.Element }[]` in `bodies.ts`; `SLIDERS` in `sliders.ts`; `MediaHelp({ media, touch, skin })`.

- [ ] **Step 1: Write the failing console tests**

```tsx
// web/src/tests/mediaConsole.test.tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { DEFAULT_ADJUST, adjustFilter } from "../components/ImageTools";
import type { ImageAdjust } from "../components/ImageTools";
import { DEFAULT_VIEW } from "../lib/mediaView";
import { MediaConsole } from "../components/console/MediaConsole";
import type { MediaControls } from "../components/console/types";

const KEYS = ["ru:media-presets", "ru:media-pads", "ru:console-open", "ru:adjust-open", "ru:console-tip", "ru:media-skin"];
afterEach(() => {
  KEYS.forEach((k) => localStorage.removeItem(k));
  vi.restoreAllMocks();
});

function Live({ media = "image", toast = vi.fn() }: { media?: "image" | "video"; toast?: (m: string) => void }) {
  const [adjust, setAdjust] = useState<ImageAdjust>(DEFAULT_ADJUST);
  const [mag, setMag] = useState(3);
  const [lens, setLens] = useState(false);
  const [ruler, setRuler] = useState(false);
  const [motion, setMotion] = useState(false);
  const [view, setView] = useState(DEFAULT_VIEW);
  const [compare, setCompare] = useState(false);
  const c: MediaControls = {
    media, adjust, setAdjust, compare, setCompare, lens, setLens, mag, setMag, view, setView, zoomBy: (f) => setView((v) => ({ ...v, z: Math.min(8, Math.max(1, v.z * f)) })),
    ruler, setRuler, motion, setMotion, savePicture: async () => {}, transport: null,
  };
  return (
    <>
      <output data-testid="filter">{adjustFilter(adjust)}</output>
      <output data-testid="state">{JSON.stringify({ mag, lens, ruler, motion, z: view.z })}</output>
      <MediaConsole c={c} touch={false} onLink={() => {}} linkLabel="Copy link to this view" toast={toast} keys />
    </>
  );
}
const state = () => JSON.parse(screen.getByTestId("state").textContent!);

describe("MediaConsole", () => {
  it("strip: zoom, magnifier, P1–P4, console, link, help; no mirror button", () => {
    render(<Live />);
    for (const name of ["Zoom out", "Zoom in", "Magnifier", "Media console", "Copy link to this view", "How to use the media tools"])
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Preset P[1-4]/ })).toHaveLength(4);
    expect(screen.queryByRole("button", { name: /flip|mirror/i })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save a preset" })).toBeNull(); // only with the console open
  });

  it("console open is remembered; first-time hint shows once", () => {
    const { unmount } = render(<Live />);
    fireEvent.click(screen.getByRole("button", { name: "Media console" }));
    expect(localStorage.getItem("ru:console-open")).toBe("1");
    expect(screen.getByText(/Tap a key to try an effect/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close the tip" }));
    expect(localStorage.getItem("ru:console-tip")).toBe("1");
    unmount();
    render(<Live />);
    expect(screen.getByRole("button", { name: "Media console" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByText(/Tap a key to try an effect/)).toBeNull();
  });

  it("a preset applies look + magnifier; it lights; keys 1–4 apply too, not while typing", () => {
    render(
      <>
        <input aria-label="comment" />
        <Live />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Preset P2: Night hunt" }));
    expect(screen.getByTestId("filter").textContent).toContain("#ru-gamma");
    expect(screen.getByTestId("filter").textContent).toContain("#ru-sharpen");
    expect(state().mag).toBe(5);
    expect(screen.getByRole("button", { name: "Preset P2: Night hunt" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.keyDown(window, { key: "3" });
    expect(screen.getByTestId("filter").textContent).toContain("#ru-ironbow");
    screen.getByLabelText("comment").focus();
    fireEvent.keyDown(window, { key: "1" });
    expect(screen.getByTestId("filter").textContent).toContain("#ru-ironbow"); // typing: ignored
  });

  it("P4 (Motion) on an image applies its look, never lights, never turns motion on", () => {
    render(<Live />);
    fireEvent.click(screen.getByRole("button", { name: "Preset P4: Motion" }));
    expect(state().motion).toBe(false);
    expect(screen.getByRole("button", { name: "Preset P4: Motion" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Preset P1: Clean" })).toHaveAttribute("aria-pressed", "true");
  });

  it("save a preset: floppy, then a slot; stored and lit", () => {
    const toast = vi.fn();
    render(<Live toast={toast} />);
    fireEvent.click(screen.getByRole("button", { name: "Media console" }));
    fireEvent.click(screen.getByRole("button", { name: "Invert" }));
    fireEvent.click(screen.getByRole("button", { name: "Save a preset" }));
    fireEvent.click(screen.getByRole("button", { name: "Preset P4: Motion" }));
    expect(toast).toHaveBeenCalledWith("Saved to P4");
    expect(localStorage.getItem("ru:media-presets")).toContain('"invert":true');
    expect(screen.getByRole("button", { name: "Preset P4: Your setup" })).toHaveAttribute("aria-pressed", "true");
  });

  it("status chips: ruler off and undo looks appear only while on", () => {
    render(<Live />);
    fireEvent.click(screen.getByRole("button", { name: "Media console" }));
    expect(screen.queryByRole("button", { name: "Ruler off" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ruler" }));
    fireEvent.click(screen.getByRole("button", { name: "Night" }));
    fireEvent.click(screen.getByRole("button", { name: "Ruler off" }));
    expect(state().ruler).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Undo looks" }));
    expect(screen.getByTestId("filter").textContent).toBe("");
  });

  it("style picker lists the styles, ticks the current one and remembers the choice", () => {
    render(<Live />);
    fireEvent.click(screen.getByRole("button", { name: "Media console" }));
    fireEvent.click(screen.getByRole("button", { name: "Console style" }));
    const menu = screen.getByRole("menu");
    expect(within(menu).getByRole("menuitemradio", { name: "Simple" })).toHaveAttribute("aria-checked", "true");
  });

  it("arrange mode: done, reset order, reset presets", () => {
    localStorage.setItem("ru:media-pads", JSON.stringify({ v: 1, effects: ["night"], tools: [] }));
    render(<Live />);
    fireEvent.click(screen.getByRole("button", { name: "Media console" }));
    fireEvent.click(screen.getByRole("button", { name: "Arrange" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset order" }));
    expect(JSON.parse(localStorage.getItem("ru:media-pads")!).effects[0]).toBe("enhance");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("button", { name: "Reset order" })).toBeNull();
  });

  it("storage that throws: still renders with defaults", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    render(<Live />);
    fireEvent.click(screen.getByRole("button", { name: "Media console" }));
    expect(screen.getByRole("button", { name: "Night" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run src/tests/mediaConsole.test.tsx`
Expected: FAIL with "Failed to resolve import "../components/console/MediaConsole""

- [ ] **Step 3: Write `sliders.ts`, `SimpleBody.tsx`, `bodies.ts`**

```ts
// web/src/components/console/sliders.ts
import { Contrast, Droplet, Moon, Sun } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/** The four tone controls, in console order. */
export const SLIDERS: { key: "brightness" | "contrast" | "saturate" | "gamma"; label: string; Icon: LucideIcon }[] = [
  { key: "brightness", label: "Brightness", Icon: Sun },
  { key: "contrast", label: "Contrast", Icon: Contrast },
  { key: "saturate", label: "Saturation", Icon: Droplet },
  { key: "gamma", label: "Shadows", Icon: Moon },
];
```

```tsx
// web/src/components/console/SimpleBody.tsx
// Simple style: a first look on any screen. Effect chips, tool chips, long
// sliders, magnifier strength, and for videos speed / loop / A–B. Every
// control is the shape of what it does: squares press, long ones slide.
import { Repeat, Repeat1, X } from "lucide-react";
import { LENS_MAGS, chip, ico, off, on } from "../ImageTools";
import { SPEEDS, abLabel } from "../../lib/useVideoTransport";
import { PadGrid } from "./PadGrid";
import { SLIDERS } from "./sliders";
import type { BodyProps } from "./types";

export function SimpleBody({ c, pads, arranging, reorder }: BodyProps) {
  const t = c.transport;
  return (
    <div className="flex flex-col gap-3">
      <PadGrid pads={pads.effects} group="effects" variant="chip" arranging={arranging} reorder={reorder} />
      <PadGrid pads={pads.tools} group="tools" variant="chip" arranging={arranging} reorder={reorder} />
      <div className="grid gap-x-5 gap-y-2 min-[600px]:grid-cols-2">
        {SLIDERS.map((s) => (
          <label key={s.key} title={s.label} className="flex items-center gap-2.5 font-mono text-[9.5px] tracking-[.4px] text-faint">
            <s.Icon {...ico} className="flex-none" />
            <input
              type="range"
              aria-label={s.label}
              min={0}
              max={200}
              value={c.adjust[s.key]}
              onChange={(e) => c.setAdjust({ ...c.adjust, [s.key]: Number(e.target.value) })}
              className="min-w-0 flex-1 accent-[var(--signal)]"
            />
            <span className="w-8 flex-none text-right text-dim">{c.adjust[s.key]}%</span>
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {LENS_MAGS.map((m) => (
          <button key={m} type="button" aria-label={`Magnifier ${m}×`} title={`Magnifier ${m}×`} aria-pressed={c.mag === m} onClick={() => c.setMag(m)} className={`${chip} ${c.mag === m ? on : off}`}>
            {m}×
          </button>
        ))}
      </div>
      {t && (
        <div className="flex flex-wrap items-center gap-2">
          {SPEEDS.map((s) => (
            <button key={s} type="button" aria-pressed={t.rate === s} title="Speed ([ ])" onClick={() => t.setSpeed(s)} className={`${chip} ${t.rate === s ? on : off}`}>
              {s}×
            </button>
          ))}
          <button type="button" aria-label="Loop" aria-pressed={t.loop} title="Loop" onClick={t.toggleLoop} className={`${chip} ${t.loop ? on : off}`}>
            <Repeat {...ico} />
          </button>
          <button type="button" aria-label={abLabel(t.ab)} aria-pressed={t.ab?.b !== undefined} title={`${abLabel(t.ab)} (A)`} onClick={t.markAb} className={`${chip} ${t.ab ? on : off}`}>
            <Repeat1 {...ico} />
            {t.ab && (t.ab.b === undefined ? "B?" : <X {...ico} size={12} />)}
          </button>
        </div>
      )}
    </div>
  );
}
```

```ts
// web/src/components/console/bodies.ts
// The console styles a visitor can pick. Each has a purpose (see the spec).
import { LayoutGrid } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { JSX } from "react";
import type { Skin } from "../../lib/consolePrefs";
import { SimpleBody } from "./SimpleBody";
import type { BodyProps } from "./types";

export const BODIES: { id: Skin; name: string; Icon: LucideIcon; Body: (p: BodyProps) => JSX.Element }[] = [
  { id: "simple", name: "Simple", Icon: LayoutGrid, Body: SimpleBody },
];
```

- [ ] **Step 4: Write `MediaConsole.tsx`**

```tsx
// web/src/components/console/MediaConsole.tsx
// The Doc media console. A strip that is always there: zoom, magnifier,
// presets P1–P4, the console button, what is on right now (one tap turns it
// off), link and help. Opened, a body in the style the visitor picked.
// Style, open/closed, the first-time hint, presets and pad order are
// remembered on this device. Doc mounts it with key={record id}, so modes
// (saving a preset, arranging, the picker) start fresh on every file.
import { useEffect, useRef, useState } from "react";
import { Activity, Check, CircleX, Eye, Link, Palette, Pencil, RotateCcw, Ruler, Save, Search, Shrink, SlidersHorizontal, Undo2, X, ZoomIn, ZoomOut } from "lucide-react";
import { DEFAULT_ADJUST, adjustFilter, chip, ico, off, on } from "../ImageTools";
import { MAX_ZOOM } from "../../lib/mediaView";
import { DEFAULT_PRESETS, loadPresets, presetMatches, savePresets, storePreset } from "../../lib/mediaPresets";
import type { Preset } from "../../lib/mediaPresets";
import { defaultOrder, loadOpen, loadOrder, loadSkin, markTipSeen, mergeVisible, saveOpen, saveOrder, saveSkin, tipSeen } from "../../lib/consolePrefs";
import type { PadOrder, Skin } from "../../lib/consolePrefs";
import { isTyping } from "../../lib/useVideoTransport";
import { MediaHelp } from "../MediaHelp";
import { BODIES } from "./bodies";
import { padHandlers, usePads } from "./pads";
import type { MediaControls } from "./types";

export function MediaConsole({ c, touch, onLink, linkLabel, toast, keys }: { c: MediaControls; touch: boolean; onLink: () => void; linkLabel: string; toast: (m: string) => void; keys: boolean }) {
  const [open, setOpenS] = useState(loadOpen);
  const [skin, setSkinS] = useState<Skin>(loadSkin);
  const [presets, setPresets] = useState<Preset[]>(loadPresets);
  const [order, setOrder] = useState<PadOrder>(loadOrder);
  const [arranging, setArranging] = useState(false);
  const [saveMode, setSaveMode] = useState(false);
  const [picker, setPicker] = useState(false);
  const [tip, setTip] = useState(() => !tipSeen());
  const pads = usePads(c, order);
  const cur = { adjust: c.adjust, mag: c.mag, motion: c.motion };
  const lit = presets.find((p) => presetMatches(p, cur, c.media)) ?? null;
  const changed = adjustFilter(c.adjust) !== "";
  const Body = (BODIES.find((b) => b.id === skin) ?? BODIES[0]).Body;
  const original = pads.effects.find((p) => p.id === "original")!;

  function setOpen(next: boolean) {
    setOpenS(next);
    saveOpen(next);
    if (!next) {
      setArranging(false);
      setSaveMode(false);
      setPicker(false);
    }
  }
  function setSkin(s: Skin) {
    setSkinS(s);
    saveSkin(s);
    setPicker(false);
  }
  function applyPreset(p: Preset) {
    c.setAdjust(p.adjust);
    c.setMag(p.mag);
    if (c.media === "video" && c.motion !== p.motion) c.setMotion(p.motion);
  }
  function pressSlot(p: Preset) {
    if (!saveMode) return applyPreset(p);
    const next = storePreset(presets, p.slot, cur);
    setPresets(next);
    savePresets(next);
    setSaveMode(false);
    toast(`Saved to P${p.slot}`);
  }
  function reorder(group: "effects" | "tools", ids: string[]) {
    const next = { ...order, [group]: mergeVisible(order[group] as string[], ids) } as PadOrder;
    setOrder(next);
    saveOrder(next);
  }

  // 1–4 apply presets (never while typing); the latest pressSlot via a ref
  const press = useRef(pressSlot);
  press.current = pressSlot;
  const slots = useRef(presets);
  slots.current = presets;
  useEffect(() => {
    if (!keys) return;
    const h = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping()) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 4 && e.key.length === 1) {
        e.preventDefault();
        press.current(slots.current[n - 1]);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [keys]);

  // the picker closes on an outside press or Esc
  const pickerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!picker) return;
    const down = (e: PointerEvent) => !pickerRef.current?.contains(e.target as Node) && setPicker(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setPicker(false);
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", esc);
    };
  }, [picker]);

  const divider = <span className="mx-0.5 h-5 w-px bg-line2" aria-hidden="true" />;

  return (
    <div className="mb-3.5">
      {/* relative: MediaHelp's panel spans this row */}
      <div className="relative flex flex-wrap items-center gap-2">
        <button type="button" aria-label="Zoom out" title="Zoom out" disabled={c.view.z <= 1} onClick={() => c.zoomBy(1 / 1.5)} className={`${chip} ${off} disabled:opacity-40`}>
          <ZoomOut {...ico} />
        </button>
        <button type="button" aria-label="Zoom in" title="Zoom in" disabled={c.view.z >= MAX_ZOOM} onClick={() => c.zoomBy(1.5)} className={`${chip} ${off} disabled:opacity-40`}>
          <ZoomIn {...ico} />
        </button>
        <button type="button" aria-label="Magnifier" aria-pressed={c.lens} title="Magnifier (L)" onClick={() => c.setLens(!c.lens)} className={`${chip} ${c.lens ? on : off}`}>
          <Search {...ico} />
        </button>
        {divider}
        {presets.map((p) => (
          <button
            key={p.slot}
            type="button"
            aria-label={`Preset P${p.slot}: ${p.name}`}
            aria-pressed={lit === p}
            title={saveMode ? `Save this setup to P${p.slot}` : `${p.name} (${p.slot})`}
            onClick={() => pressSlot(p)}
            className={`${chip} ${lit === p ? on : off} ${saveMode ? "outline-dashed outline-1 outline-offset-2 outline-signal motion-safe:animate-pulse" : ""}`}
          >
            P{p.slot}
          </button>
        ))}
        {open && (
          <button type="button" aria-label="Save a preset" aria-pressed={saveMode} title="Save this setup: tap this, then a slot" onClick={() => setSaveMode(!saveMode)} className={`${chip} ${saveMode ? on : off}`}>
            <Save {...ico} />
          </button>
        )}
        <button type="button" aria-label="Media console" aria-expanded={open} title="Media console" onClick={() => setOpen(!open)} className={`${chip} ${open || changed ? on : off}`}>
          <SlidersHorizontal {...ico} />
        </button>
        {c.view.z > 1 && (
          <button type="button" aria-label="Reset zoom" title="Full view (0)" onClick={() => c.setView({ ...c.view, z: 1, x: 0, y: 0 })} className={`${chip} ${on}`}>
            <Shrink {...ico} />
            {c.view.z.toFixed(1)}×
            <X {...ico} size={12} />
          </button>
        )}
        {c.ruler && (
          <button type="button" aria-label="Ruler off" title="Turn the ruler off" onClick={() => c.setRuler(false)} className={`${chip} ${on}`}>
            <Ruler {...ico} />
            <X {...ico} size={12} />
          </button>
        )}
        {c.motion && (
          <button type="button" aria-label="Motion off" title="Turn motion off" onClick={() => c.setMotion(false)} className={`${chip} ${on}`}>
            <Activity {...ico} />
            <X {...ico} size={12} />
          </button>
        )}
        {changed && (
          <button type="button" aria-label="Hold to see the original" aria-pressed={c.compare} title="Hold to see the original (\)" {...padHandlers(original, false)} className={`${chip} ${c.compare ? on : off} touch-none select-none`}>
            <Eye {...ico} />
          </button>
        )}
        {changed && (
          <button type="button" aria-label="Undo looks" title="Back to the file as it came" onClick={() => c.setAdjust(DEFAULT_ADJUST)} className={`${chip} ${off}`}>
            <RotateCcw {...ico} />
          </button>
        )}
        <span className="ml-auto flex gap-2">
          <button type="button" aria-label={linkLabel} title={linkLabel} onClick={onLink} className={`${chip} ${off}`}>
            <Link {...ico} />
          </button>
          <MediaHelp media={c.media} touch={touch} skin={skin} />
        </span>
      </div>

      {open && (
        <div className="mt-3 rounded-2xl border border-line bg-surface p-3.5">
          {tip && (
            <p className="mb-3 flex items-start gap-2 text-[12px] leading-snug text-dim">
              <span className="flex-1">Tap a key to try an effect. Hold the eye to compare with the original.</span>
              <button
                type="button"
                aria-label="Close the tip"
                title="Close the tip"
                onClick={() => {
                  setTip(false);
                  markTipSeen();
                }}
                className="-m-2 grid size-8 place-items-center text-faint"
              >
                <CircleX size={16} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </p>
          )}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div ref={pickerRef} className="relative">
              <button type="button" aria-label="Console style" aria-haspopup="menu" aria-expanded={picker} title="Console style" onClick={() => setPicker(!picker)} className={`${chip} ${picker ? on : off}`}>
                <Palette {...ico} />
              </button>
              {picker && (
                <div role="menu" aria-label="Console style" className="absolute left-0 top-full z-30 mt-1.5 min-w-[180px] rounded-xl border border-line2 bg-bg2 p-1 shadow-[0_6px_24px_rgba(0,0,0,.45)]">
                  {BODIES.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={b.id === skin}
                      onClick={() => setSkin(b.id)}
                      className={`flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[12.5px] ${b.id === skin ? "text-signal" : "text-ink"}`}
                    >
                      <b.Icon size={16} strokeWidth={1.75} aria-hidden="true" />
                      <span className="flex-1">{b.name}</span>
                      {b.id === skin && <Check size={14} strokeWidth={2} aria-hidden="true" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button type="button" aria-label="Arrange" aria-pressed={arranging} title="Arrange: drag keys into your own order" onClick={() => setArranging(!arranging)} className={`${chip} ${arranging ? on : off}`}>
              <Pencil {...ico} />
            </button>
            {arranging && (
              <>
                <button type="button" aria-label="Done" title="Done" onClick={() => setArranging(false)} className={`${chip} ${on}`}>
                  <Check {...ico} />
                </button>
                <button
                  type="button"
                  aria-label="Reset order"
                  title="Put the keys back in their first order"
                  onClick={() => {
                    const d = defaultOrder();
                    setOrder(d);
                    saveOrder(d);
                  }}
                  className={`${chip} ${off}`}
                >
                  <Undo2 {...ico} />
                </button>
                <button
                  type="button"
                  aria-label="Reset presets"
                  title="Put P1–P4 back to Clean, Night hunt, Thermal, Motion"
                  onClick={() => {
                    setPresets(DEFAULT_PRESETS);
                    savePresets(DEFAULT_PRESETS);
                  }}
                  className={`${chip} ${off}`}
                >
                  <RotateCcw {...ico} />
                </button>
              </>
            )}
          </div>
          <Body c={c} pads={pads} arranging={arranging} reorder={reorder} presetName={lit?.name ?? null} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Let MediaHelp take `skin`**

In `web/src/components/MediaHelp.tsx` widen the props type only: `export function MediaHelp({ media, touch }: { media: Kind; touch: boolean; skin?: "simple" | "dj" | "walkman" })`. Task 11 starts reading `skin`.

- [ ] **Step 6: Run the console tests**

Run: `cd web && npx vitest run src/tests/mediaConsole.test.tsx`
Expected: PASS (9 tests)

- [ ] **Step 7: Wire the console into Doc; trim the playback row; remove MediaToolbar**

In `web/src/screens/Doc.tsx`:
1. Import `MediaConsole` from `"../components/console/MediaConsole"` and `type { MediaControls }` from `"../components/console/types"`; remove `MediaToolbar` and `MediaHelp` from imports; import `turned` from `"../lib/mediaView"`.
2. Delete the `speedSlot` state line and its comment.
3. In the keydown handler replace the `k === "r"` branch body with `setView(turned)`.
4. After the line `const srcLinks = sourceLinks(record, pdfPage);` add:

```tsx
  const controls: MediaControls = {
    media: media === "video" ? "video" : "image",
    adjust,
    setAdjust,
    compare,
    setCompare,
    lens,
    setLens,
    mag,
    setMag,
    view,
    setView,
    zoomBy: zoom.zoomBy,
    ruler,
    setRuler,
    motion,
    setMotion: toggleMotion,
    savePicture: saveView,
    transport: media === "video" ? transport : null,
  };
```
5. Replace `<VideoTransport transport={transport} onShare={handleShare} speedSlot={speedSlot} />` with `<VideoTransport transport={transport} />`.
6. Replace the whole `<MediaToolbar … />` element with:

```tsx
        <MediaConsole
          key={id}
          c={controls}
          touch={!finePointer}
          onLink={() => (media === "video" ? handleShare(transport.now()) : handleShare())}
          linkLabel={media === "video" ? "Copy link to this moment" : "Copy link to this view"}
          toast={toast}
          keys={!(composer || viewer)}
        />
```

In `web/src/components/VideoTools.tsx`, make `VideoTransport` the playback row only:

```tsx
export function VideoTransport({ transport: tr }: { transport: Transport }) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      {/* own seek bar: the native controls hide while the video is zoomed/rotated */}
      <input
        type="range"
        aria-label="Seek"
        min={0}
        max={tr.dur || 0}
        step={1 / FPS}
        value={Math.min(tr.t, tr.dur || 0)}
        onChange={(e) => tr.seek(Number(e.target.value))}
        className="w-full accent-[var(--signal)]"
      />
      <button type="button" aria-label={tr.playing ? "Pause" : "Play"} title={`${tr.playing ? "Pause" : "Play"} (Space)`} onClick={tr.togglePlay} className={`${chip} ${off}`}>
        {tr.playing ? <Pause {...ico} /> : <Play {...ico} />}
      </button>
      <span className="font-mono text-[10px] tabular-nums text-dim">
        {formatMoment(tr.t, true)} / {formatMoment(tr.dur, true)}
      </span>
      <button type="button" aria-label="Previous frame" title="Previous frame (,)" onClick={() => tr.step(-1)} className={`${chip} ${off}`}>
        <StepBack {...ico} />
      </button>
      <span className="font-mono text-[10px] tabular-nums text-faint">F{frameOf(tr.t)}</span>
      <button type="button" aria-label="Next frame" title="Next frame (.)" onClick={() => tr.step(1)} className={`${chip} ${off}`}>
        <StepForward {...ico} />
      </button>
      <span className="ml-auto flex gap-2">
        <button type="button" aria-label={tr.muted ? "Unmute" : "Mute"} aria-pressed={tr.muted} title={`${tr.muted ? "Unmute" : "Mute"} (M)`} onClick={tr.toggleMute} className={`${chip} ${tr.muted ? on : off}`}>
          {tr.muted ? <VolumeX {...ico} /> : <Volume2 {...ico} />}
        </button>
        <button type="button" aria-label={tr.full ? "Exit full screen" : "Full screen"} aria-pressed={tr.full} title={tr.full ? "Exit full screen (Esc)" : "Full screen"} onClick={tr.toggleFull} className={`${chip} ${tr.full ? on : off}`}>
          {tr.full ? <Minimize {...ico} /> : <Maximize {...ico} />}
        </button>
      </span>
    </div>
  );
}
```
(import `FPS`, `frameOf` from `../lib/useVideoTransport`; drop now-unused imports: `createPortal`, `Camera`, `Download`, `Link`, `LoaderCircle`, `MessageSquarePlus`, `Repeat`, `Repeat1`, `TriangleAlert`, `X`, `SPEEDS`, `abLabel`, `on` if unused.)

In `web/src/components/ImageTools.tsx`, delete `MediaToolbar`, `ADJUST_OPEN_KEY`, `PRESETS`, `TONE`, `PALETTES`, `SLIDERS` and the lucide imports only they used; keep everything else (`chip`, `ico`, `on`, `off`, filters, lens, minimap, `renderPng`, `grabImage`).

- [ ] **Step 8: Update the Doc tests for the moved controls**

In `web/src/tests/doc.test.tsx` add this helper below `renderDoc`:

```tsx
/** The media console starts closed; most tools live inside it. */
function openConsole() {
  const b = screen.getByRole("button", { name: "Media console" });
  if (b.getAttribute("aria-expanded") !== "true") fireEvent.click(b);
}
```
and add `"ru:console-open", "ru:console-tip", "ru:media-presets", "ru:media-pads", "ru:media-skin"` removal to `beforeEach` next to the existing `localStorage.removeItem?.("ru:adjust-open")`.

Then apply these edits (test name → change):

| Test (line ≈) | Change |
|---|---|
| "image tools: presets + sliders filter the image…" (490) | `getByRole("button", { name: /adjust/i })` → `"Media console"`; `"ru:adjust-open"` → `"ru:console-open"`; `/invert ir/i` → `"Invert"`; `name: /reset/i` → `"Undo looks"`; `name: /lens/i` → `"Magnifier"` |
| "video tools: speed, frame step, loop, A–B…" (522) | comment "speed + loop live in the Adjust panel" → "…in the media console"; `/adjust/i` → `"Media console"`; `"ru:adjust-open"` → `"ru:console-open"`; `/invert ir/i` → `"Invert"`; `/lens/i` → `"Magnifier"` |
| "with a mouse the lens is on by default…" (579) | none expected; if the help button lookup fails, keep `"How to use the media tools"` (unchanged label) |
| "lens bubble is portalled…" (615) | `/lens/i` → `"Magnifier"` |
| "palette, sharpen, rotate, flip and keyboard shortcuts…" (654) | call `openConsole()` before the first effect click; `/adjust/i` click → `openConsole()`; `/invert ir/i` → `"Invert"`; `/rotate 90/i` → `"Turn"`; replace `fireEvent.click(screen.getByRole("button", { name: "Flip" }))` with `expect(screen.queryByRole("button", { name: "Flip" })).toBeNull(); fireEvent.keyDown(window, { key: "f" });`; the lens magnification assertion after `"="` becomes `expect(screen.getByRole("button", { name: "Magnifier 5×" })).toHaveAttribute("aria-pressed", "true");` |
| "hold to compare…" (923) | `/adjust/i` click → `openConsole()`; `/invert ir/i` → `"Invert"`; the hold button query `{ name: /hold to see the original/i }` now matches two buttons (strip chip + key): use `getAllByRole(...)[0]` |
| "save view…" (949) | `openConsole()` first; `"Save view"` → `"Save picture"` |
| "Shadows slider…" (1037) | `/adjust/i` → `openConsole()` |
| "ruler…" (1059) | `openConsole()` before clicking `"Ruler"`; the turn-off click uses `"Ruler"` (pad) or `"Ruler off"` (strip) — keep the pad |
| "Motion (video)…" (1092) | `openConsole()` before the first `"Motion"` click |
| "help panel lists every tool…" (1114) | unchanged now; it is rewritten in Task 11 (see Step 9 if it fails here) |
| "no image tools on non-image records" (1151) | `/adjust/i` → `"Media console"` |
| "media tool filters + lens live in the URL…" (1198) | `/adjust/i` → `openConsole()`; `/invert ir/i` → `"Invert"`; `/rotate 90/i` → `"Turn"`; `"Lens"` → `"Magnifier"`; lens magnification chip assertions → open console and check `"Magnifier 5×"` / `"Magnifier 3×"` `aria-pressed` |
| "bad media tool params fall back to defaults" (1231) | `/lens magnification 3×/i` → `openConsole()` then `"Magnifier 3×"` has `aria-pressed="true"` |

Add one Doc-level test (Review Focus 2 and 1):

```tsx
  it("console: storage that throws still renders; F flips with no mirror button", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    useRecordMock.mockReturnValue({
      data: { ...mockDetail, record: { ...mockDetail.record, kind: "image" }, assets: [{ role: "full", cdn_url: "https://cdn.example/photo.jpg", mime: "image/jpeg", width: null, height: null }] },
      isLoading: false,
    });
    renderDoc();
    openConsole();
    expect(screen.getByRole("button", { name: "Night" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Flip" })).toBeNull();
    fireEvent.keyDown(window, { key: "f" });
    expect((document.querySelector('[data-screen="doc"] img') as HTMLImageElement).style.transform).toContain("scaleX(-1)");
    get.mockRestore();
  });
```

- [ ] **Step 9: Run everything**

Run: `cd web && npx tsc --noEmit -p . && npx vitest run`
Expected: no type errors; all tests PASS. The help-panel test should still pass (MediaHelp content is unchanged until Task 11); if it fails, fix the test to the current titles so this commit is green, and Task 11 rewrites it.

- [ ] **Step 10: Browser check (Simple style)**

Run the dev servers (`preview_start` "worker-dev" and "web-dev"), open `http://localhost:5173/doc/NASA-UAP-D030` and `http://localhost:5173/doc/FBI-UAP-PR003` at desktop and at the 375px mobile preset: the strip fits on one line on desktop and wraps cleanly on a phone; open the console, try P2, save to P4, arrange (drag an effect), reload: order, presets, open state and style persist; the tip shows once.

- [ ] **Step 11: Commit**

```bash
git add web/src/components/console/MediaConsole.tsx web/src/components/console/SimpleBody.tsx web/src/components/console/bodies.ts web/src/components/console/sliders.ts web/src/components/MediaHelp.tsx web/src/screens/Doc.tsx web/src/components/VideoTools.tsx web/src/components/ImageTools.tsx web/src/tests/mediaConsole.test.tsx web/src/tests/doc.test.tsx
git commit -m "feat(web): media console (strip, presets P1-P4, Simple style) replaces the toolbar

Strip: zoom, magnifier, presets, console, what's on (one tap off), link,
help. Console: style picker, arrange mode, first-time tip. Mirror button
gone (F key and ?flip=1 still work). Playback row keeps play/step/mute/full
screen; speed, loop, A-B, save/post/download live in the console.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: DJ deck style

**Files:**
- Create: `web/src/components/console/wheel.tsx`, `web/src/components/console/DjBody.tsx`
- Modify: `web/src/components/console/bodies.ts`
- Test: `web/src/tests/consoleStyles.test.tsx`

**Interfaces:**
- Consumes: `ClickWheel`, `Knob`, `Fader`, `PadGrid`, `SLIDERS`, `BodyProps`, `Transport.nextWheelSpeed`, `turned`.
- Produces: `wheelProps(c: MediaControls): Parameters<typeof ClickWheel>[0]`; `DjBody(p: BodyProps)`; `BODIES` gains `{ id: "dj", name: "DJ deck", Icon: Disc3, Body: DjBody }`.

- [ ] **Step 1: Write the failing test**

```tsx
// web/src/tests/consoleStyles.test.tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { DEFAULT_ADJUST } from "../components/ImageTools";
import type { ImageAdjust } from "../components/ImageTools";
import { DEFAULT_VIEW } from "../lib/mediaView";
import { MediaConsole } from "../components/console/MediaConsole";
import type { MediaControls } from "../components/console/types";
import type { Transport } from "../lib/useVideoTransport";

afterEach(() => {
  ["ru:media-skin", "ru:console-open", "ru:console-tip"].forEach((k) => localStorage.removeItem(k));
  vi.restoreAllMocks();
});

function transportStub(): Transport {
  return {
    t: 2, dur: 10, playing: false, rate: 1, loop: false, muted: true, ab: null, capture: "idle", full: false,
    now: () => 2, seek: vi.fn(), togglePlay: vi.fn(), step: vi.fn(), setSpeed: vi.fn(), nextWheelSpeed: vi.fn(), toggleLoop: vi.fn(),
    toggleMute: vi.fn(), toggleFull: vi.fn(), markAb: vi.fn(), grab: vi.fn().mockResolvedValue(undefined), download: vi.fn(),
  };
}

function Live({ media, skin, transport = null }: { media: "image" | "video"; skin: string; transport?: Transport | null }) {
  localStorage.setItem("ru:media-skin", skin);
  localStorage.setItem("ru:console-open", "1");
  localStorage.setItem("ru:console-tip", "1");
  const [adjust, setAdjust] = useState<ImageAdjust>(DEFAULT_ADJUST);
  const [view, setView] = useState(DEFAULT_VIEW);
  const [mag, setMag] = useState(3);
  const [lens, setLens] = useState(false);
  const c: MediaControls = {
    media, adjust, setAdjust, compare: false, setCompare: () => {}, lens, setLens, mag, setMag, view, setView,
    zoomBy: (f) => setView((v) => ({ ...v, z: Math.min(8, Math.max(1, v.z * f)) })), ruler: false, setRuler: () => {},
    motion: false, setMotion: () => {}, savePicture: async () => {}, transport,
  };
  return (
    <>
      <output data-testid="state">{JSON.stringify({ z: view.z, rot: view.rot, mag, lens, b: adjust.brightness })}</output>
      <MediaConsole c={c} touch={false} onLink={() => {}} linkLabel="Copy link" toast={() => {}} keys />
    </>
  );
}
const state = () => JSON.parse(screen.getByTestId("state").textContent!);

describe("DJ deck", () => {
  it("faders, pads and the click wheel (video: presses drive the transport)", () => {
    const t = transportStub();
    render(<Live media="video" skin="dj" transport={t} />);
    const wheel = screen.getByRole("slider", { name: "Frames" });
    expect(wheel).toHaveAttribute("aria-valuetext", "0:02.00");
    fireEvent.keyDown(wheel, { key: "ArrowRight" });
    expect(t.step).toHaveBeenCalledWith(1);
    fireEvent.click(within(wheel).getByRole("button", { name: "Play" }), { detail: 0 });
    expect(t.togglePlay).toHaveBeenCalled();
    fireEvent.click(within(wheel).getByRole("button", { name: "Speed 1×" }), { detail: 0 });
    expect(t.nextWheelSpeed).toHaveBeenCalled();
    fireEvent.click(within(wheel).getByRole("button", { name: "Loop A–B: set A" }), { detail: 0 });
    expect(t.markAb).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Loop" })).toBeInTheDocument();
    expect(screen.getByLabelText("Shadows")).toBeInTheDocument();
  });

  it("image: the wheel zooms, centre = full view, top = magnifier, bottom = turn; knob sets strength", () => {
    render(<Live media="image" skin="dj" />);
    const wheel = screen.getByRole("slider", { name: "Zoom" });
    fireEvent.keyDown(wheel, { key: "ArrowRight" });
    expect(state().z).toBeGreaterThan(1);
    fireEvent.click(within(wheel).getByRole("button", { name: "Full view" }), { detail: 0 });
    expect(state().z).toBe(1);
    fireEvent.click(within(wheel).getByRole("button", { name: "Magnifier" }), { detail: 0 });
    expect(state().lens).toBe(true);
    fireEvent.click(within(wheel).getByRole("button", { name: "Turn" }), { detail: 0 });
    expect(state().rot).toBe(90);
    fireEvent.keyDown(screen.getByRole("slider", { name: "Magnifier strength" }), { key: "ArrowUp" });
    expect(state().mag).toBe(5);
    fireEvent.change(screen.getByLabelText("Brightness"), { target: { value: "150" } });
    expect(state().b).toBe(150);
  });

  it("the picker lists DJ deck and switching is remembered", () => {
    render(<Live media="image" skin="simple" />);
    fireEvent.click(screen.getByRole("button", { name: "Console style" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "DJ deck" }));
    expect(localStorage.getItem("ru:media-skin")).toBe("dj");
    expect(screen.getByRole("slider", { name: "Zoom" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run src/tests/consoleStyles.test.tsx`
Expected: FAIL (no slider named "Frames"/"Zoom"; no "DJ deck" menu item)

- [ ] **Step 3: Write `wheel.tsx` and `DjBody.tsx`, register the style**

```tsx
// web/src/components/console/wheel.tsx
// What the click wheel does for this file. Video: the ring scrubs frames
// (12° a frame, a small haptic tick), centre plays/pauses, sides step a
// frame, top cycles speed, bottom sets the A–B loop. Image: the ring zooms,
// centre = full view, sides zoom out/in, top = magnifier, bottom = turn.
import { Pause, Play, Search, Shrink, StepBack, StepForward, RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import type { ComponentProps } from "react";
import { formatMoment } from "../../lib/recordMedia";
import { abLabel } from "../../lib/useVideoTransport";
import { turned } from "../../lib/mediaView";
import type { ClickWheel } from "./ClickWheel";
import type { MediaControls } from "./types";

const icon = { size: 18, strokeWidth: 1.75, "aria-hidden": true } as const;

export function wheelProps(c: MediaControls): ComponentProps<typeof ClickWheel> {
  const t = c.transport;
  if (t)
    return {
      label: "Frames",
      valueText: formatMoment(t.t, true),
      stepDeg: 12,
      onStep: (n) => {
        t.step(n);
        navigator.vibrate?.(5);
      },
      presses: {
        centre: { label: t.playing ? "Pause" : "Play", content: t.playing ? <Pause {...icon} /> : <Play {...icon} />, onPress: t.togglePlay },
        left: { label: "Previous frame", content: <StepBack {...icon} />, onPress: () => t.step(-1) },
        right: { label: "Next frame", content: <StepForward {...icon} />, onPress: () => t.step(1) },
        top: { label: `Speed ${t.rate}×`, content: `${t.rate}×`, onPress: t.nextWheelSpeed, on: t.rate !== 1 },
        bottom: { label: abLabel(t.ab), content: "A–B", onPress: t.markAb, on: !!t.ab },
      },
    };
  return {
    label: "Zoom",
    valueText: `${c.view.z.toFixed(1)}×`,
    stepDeg: 6,
    onStep: (n) => c.zoomBy(Math.exp((n * 6) / 180)),
    presses: {
      centre: { label: "Full view", content: <Shrink {...icon} />, onPress: () => c.setView({ ...c.view, z: 1, x: 0, y: 0 }) },
      left: { label: "Zoom out", content: <ZoomOut {...icon} />, onPress: () => c.zoomBy(1 / 1.5) },
      right: { label: "Zoom in", content: <ZoomIn {...icon} />, onPress: () => c.zoomBy(1.5) },
      top: { label: "Magnifier", content: <Search {...icon} />, onPress: () => c.setLens(!c.lens), on: c.lens },
      bottom: { label: "Turn", content: <RotateCw {...icon} />, onPress: () => c.setView(turned(c.view)) },
    },
  };
}
```

```tsx
// web/src/components/console/DjBody.tsx
// DJ deck style: for studying footage. Faders on the left, pads in the
// middle, the deck (click wheel + magnifier knob) on the right; on phones
// the deck comes first (most used), then pads, then faders.
import { Repeat } from "lucide-react";
import { LENS_MAGS, chip, ico, off, on } from "../ImageTools";
import { ClickWheel } from "./ClickWheel";
import { Fader } from "./Fader";
import { Knob } from "./Knob";
import { PadGrid } from "./PadGrid";
import { SLIDERS } from "./sliders";
import { wheelProps } from "./wheel";
import type { BodyProps } from "./types";

export function DjBody({ c, pads, arranging, reorder }: BodyProps) {
  const t = c.transport;
  return (
    <div className="grid gap-5 min-[900px]:grid-cols-[auto_minmax(0,1fr)_auto] min-[900px]:items-start">
      <div className="flex h-36 justify-center gap-4 min-[900px]:order-1">
        {SLIDERS.map((s) => (
          <Fader key={s.key} label={s.label} Icon={s.Icon} value={c.adjust[s.key]} onChange={(v) => c.setAdjust({ ...c.adjust, [s.key]: v })} />
        ))}
      </div>
      <div className="flex flex-col gap-2 min-[900px]:order-2">
        <PadGrid pads={pads.effects} group="effects" variant="pad" arranging={arranging} reorder={reorder} />
        <PadGrid pads={pads.tools} group="tools" variant="pad" arranging={arranging} reorder={reorder} />
      </div>
      <div className="order-first flex items-center justify-center gap-4 min-[900px]:order-3">
        <ClickWheel {...wheelProps(c)} />
        <div className="flex flex-col items-center gap-3">
          <Knob label="Magnifier strength" values={LENS_MAGS} value={c.mag} onChange={c.setMag} />
          {t && (
            <button type="button" aria-label="Loop" aria-pressed={t.loop} title="Loop" onClick={t.toggleLoop} className={`${chip} ${t.loop ? on : off}`}>
              <Repeat {...ico} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

In `bodies.ts` add `import { Disc3 } from "lucide-react";` (merge with the existing lucide import), `import { DjBody } from "./DjBody";` and the entry `{ id: "dj", name: "DJ deck", Icon: Disc3, Body: DjBody },` after Simple.

- [ ] **Step 4: Run tests**

Run: `cd web && npx vitest run src/tests/consoleStyles.test.tsx src/tests/mediaConsole.test.tsx`
Expected: PASS

- [ ] **Step 5: Browser check**

DJ deck on `FBI-UAP-PR003` and `NASA-UAP-D030`, desktop + 375px: slide round the wheel with the mouse (frames move one per 12°, no jumps across the left side), tap centre/sides/top/bottom, drag the knob, faders, double-tap a fader to reset; on the phone the deck is first and nothing overflows horizontally.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/console/wheel.tsx web/src/components/console/DjBody.tsx web/src/components/console/bodies.ts web/src/tests/consoleStyles.test.tsx
git commit -m "feat(web): DJ deck console style (faders, pads, click wheel, magnifier knob)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Walkman style

**Files:**
- Create: `web/src/components/console/CassetteWindow.tsx`, `web/src/components/console/WalkmanBody.tsx`
- Modify: `web/src/components/console/bodies.ts`
- Test: `web/src/tests/consoleStyles.test.tsx` (append)

**Interfaces:**
- Consumes: `Keyboard`, `ClickWheel`, `wheelProps`, `Knob`, `Fader`, `SLIDERS`, `BodyProps.presetName`.
- Produces: `CassetteWindow({ value, preset, speed, spinning }: { value: string; preset: string | null; speed: number | null; spinning: boolean })`; `WalkmanBody(p: BodyProps)`; `BODIES` gains `{ id: "walkman", name: "Walkman", Icon: CassetteTape, Body: WalkmanBody }`.

- [ ] **Step 1: Write the failing test** (append inside `consoleStyles.test.tsx`)

```tsx
describe("Walkman", () => {
  it("cassette window shows what's on; keyboard keys and the wheel work", () => {
    const t = transportStub();
    render(<Live media="video" skin="walkman" transport={{ ...t, rate: 0.5 }} />);
    const win = screen.getByRole("status", { name: "Now" });
    expect(win).toHaveTextContent("0:02.00");
    expect(win).toHaveTextContent("Clean"); // P1 lit by default
    expect(win).toHaveTextContent("0.5×");
    expect(document.querySelectorAll("[data-key=white]")).toHaveLength(8);
    expect(document.querySelectorAll("[data-key=black]")).toHaveLength(6); // video: all six tools
    fireEvent.click(screen.getByRole("button", { name: "Night" }));
    expect(screen.getByRole("button", { name: "Night" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("slider", { name: "Frames" })).toBeInTheDocument();
  });

  it("reels turn only while playing and never under reduced motion", () => {
    render(<Live media="video" skin="walkman" transport={{ ...transportStub(), playing: true }} />);
    const reel = document.querySelector("[data-reel]") as HTMLElement;
    expect(reel.className).toContain("motion-safe:animate-");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run src/tests/consoleStyles.test.tsx`
Expected: FAIL (no status named "Now")

- [ ] **Step 3: Write the components and register**

```tsx
// web/src/components/console/CassetteWindow.tsx
// The Walkman's little window: what is on at a glance (time or zoom, the
// preset, the speed). The two reels turn while a video plays: they are
// there because they show playback, not to decorate. Still under
// prefers-reduced-motion.
export function CassetteWindow({ value, preset, speed, spinning }: { value: string; preset: string | null; speed: number | null; spinning: boolean }) {
  const reel = `size-8 flex-none rounded-full border border-dashed border-line2 grid place-items-center ${spinning ? "motion-safe:animate-[spin_3s_linear_infinite]" : ""}`;
  return (
    <div role="status" aria-label="Now" className="flex items-center gap-3 rounded-[10px] border border-line2 bg-bg2 px-3 py-2">
      <span data-reel aria-hidden="true" className={reel}>
        <span className="size-2.5 rounded-full border border-line2" />
      </span>
      <span className="min-w-0 flex-1 text-center font-mono leading-tight">
        <span className="block text-[17px] tabular-nums text-signal">{value}</span>
        <span className="block truncate text-[10.5px] text-dim">
          {preset ?? "Your own mix"}
          {speed !== null ? ` · ${speed}×` : ""}
        </span>
      </span>
      <span aria-hidden="true" className={reel}>
        <span className="size-2.5 rounded-full border border-line2" />
      </span>
    </div>
  );
}
```

```tsx
// web/src/components/console/WalkmanBody.tsx
// Walkman style: one-thumb use on a phone. One compact body: the cassette
// window on top, faders and the Wakeman keyboard, the click wheel under
// the thumb. Wide screens put the wheel to the right of the keys.
import { LENS_MAGS } from "../ImageTools";
import { formatMoment } from "../../lib/recordMedia";
import { CassetteWindow } from "./CassetteWindow";
import { ClickWheel } from "./ClickWheel";
import { Fader } from "./Fader";
import { Keyboard } from "./Keyboard";
import { Knob } from "./Knob";
import { SLIDERS } from "./sliders";
import { wheelProps } from "./wheel";
import type { BodyProps } from "./types";

export function WalkmanBody({ c, pads, arranging, reorder, presetName }: BodyProps) {
  const t = c.transport;
  return (
    <div className="overflow-hidden rounded-2xl border border-line2 bg-bg2">
      <div className="h-1.5 bg-signal" aria-hidden="true" />
      <div className="flex flex-col gap-4 p-4">
        <CassetteWindow value={t ? formatMoment(t.t, true) : `${c.view.z.toFixed(1)}×`} preset={presetName} speed={t ? t.rate : null} spinning={!!t?.playing} />
        <div className="grid gap-4 min-[900px]:grid-cols-[minmax(0,1fr)_auto] min-[900px]:items-center">
          <div className="flex flex-col gap-4">
            <div className="flex h-28 justify-center gap-5">
              {SLIDERS.map((s) => (
                <Fader key={s.key} label={s.label} Icon={s.Icon} value={c.adjust[s.key]} onChange={(v) => c.setAdjust({ ...c.adjust, [s.key]: v })} />
              ))}
            </div>
            <Keyboard pads={pads} arranging={arranging} reorder={reorder} />
          </div>
          <div className="flex items-center justify-center gap-4">
            <ClickWheel {...wheelProps(c)} />
            <Knob label="Magnifier strength" values={LENS_MAGS} value={c.mag} onChange={c.setMag} />
          </div>
        </div>
      </div>
    </div>
  );
}
```

In `bodies.ts` add `CassetteTape` to the lucide import, `import { WalkmanBody } from "./WalkmanBody";` and the entry `{ id: "walkman", name: "Walkman", Icon: CassetteTape, Body: WalkmanBody },`.

- [ ] **Step 4: Run tests**

Run: `cd web && npx vitest run src/tests/consoleStyles.test.tsx`
Expected: PASS

- [ ] **Step 5: Browser check**

Walkman on both files, desktop + 375px: keys are at least 36px (measure with `getBoundingClientRect` in the browser), black keys never cover a white key's whole face, the wheel sits under the thumb on the phone, reels spin while playing and stop when paused, the window updates time/zoom/preset/speed.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/console/CassetteWindow.tsx web/src/components/console/WalkmanBody.tsx web/src/components/console/bodies.ts web/src/tests/consoleStyles.test.tsx
git commit -m "feat(web): Walkman console style (cassette window, Wakeman keyboard, click wheel)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Help panel regrouped for the console

**Files:**
- Modify: `web/src/components/MediaHelp.tsx`
- Test: `web/src/tests/doc.test.tsx` (the "help panel lists every tool…" test)

**Interfaces:**
- Consumes: `MediaHelp({ media, touch, skin })` from Task 8.
- Produces: groups, in order: "The strip", "Change the look", "Tools", "The click wheel" (only when `skin !== "simple"`), "Play the video" (video only), "Make it yours", "Move between files".

- [ ] **Step 1: Rewrite the help test**

Replace the body of "help panel lists every tool for this kind of file, with phone gestures on touch screens" with:

```tsx
    useRecordMock.mockReturnValue({
      data: { ...mockDetail, record: { ...mockDetail.record, kind: "image" }, assets: [{ role: "full", cdn_url: "https://cdn.example/photo.jpg", mime: "image/jpeg", width: null, height: null }] },
      isLoading: false,
    });
    const { unmount } = renderDoc();
    const help = () => document.getElementById(screen.getByRole("button", { name: "How to use the media tools" }).getAttribute("aria-controls")!)!;
    const groups = () => [...help().querySelectorAll("h3")].map((h) => h.textContent);
    const names = () => [...help().querySelectorAll("li b")].map((b) => b.textContent);
    expect(groups()).toEqual(["The strip", "Change the look", "Tools", "Make it yours", "Move between files"]);
    expect(names()).toEqual(expect.arrayContaining(["Presets", "Night", "See the original", "Ruler", "Turn", "Save picture", "Console style", "Arrange"]));
    expect(names()).not.toContain("Mirror");
    expect(names()).not.toContain("Motion");
    const zoom = [...help().querySelectorAll("li")].find((li) => li.querySelector("b")?.textContent === "Zoom in or out")!;
    expect(zoom).toHaveTextContent("Pinch");
    expect(help().querySelector("kbd")).toBeNull();
    unmount();

    localStorage.setItem("ru:media-skin", "walkman");
    useRecordMock.mockReturnValue({
      data: { ...mockDetail, record: { ...mockDetail.record, kind: "video" }, assets: [{ role: "full", cdn_url: "https://cdn.example/clip.mp4", mime: "video/mp4", width: null, height: null }] },
      isLoading: false,
    });
    renderDoc();
    expect(groups()).toEqual(["The strip", "Change the look", "Tools", "The click wheel", "Play the video", "Make it yours", "Move between files"]);
    expect(names()).toEqual(expect.arrayContaining(["Motion", "Save frame", "Slide the ring", "Play or pause"]));
    expect(names()).not.toContain("Save picture");
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run src/tests/doc.test.tsx -t "help panel"`
Expected: FAIL on the group titles

- [ ] **Step 3: Replace the `HELP` data in `MediaHelp.tsx`**

Destructure `skin = "simple"` in the signature. Keep the component and row rendering as they are; keep `only?: Kind` filtering and add a `wheel?: true` group flag (group shown only when `skin !== "simple"`). Replace the `HELP` array with (adding `wheel?: true` to the group type and `CassetteTape`, `Disc3`, `LayoutGrid`, `Palette`, `Pencil`, `Save`, `SlidersHorizontal`, `Hash`, `RotateCw` to the lucide import as used; drop icons no longer used):

```tsx
const HELP: { title: string; only?: Kind; wheel?: true; rows: Row[] }[] = [
  {
    title: "The strip",
    rows: [
      { Icon: ZoomIn, name: "Zoom in or out", what: "Use the zoom buttons, or zoom right where you point.", keys: ["Ctrl/⌘ + scroll"], touch: "Pinch" },
      { Icon: MousePointerClick, name: "Quick zoom", what: "Zoom into a spot; do it again to go back.", keys: ["Double-click"], touch: "Double-tap" },
      { Icon: Hand, name: "Move around", what: "Drag the zoomed picture.", keys: ["Drag"], touch: "Drag" },
      { Icon: MapIcon, name: "Mini map", what: "While zoomed, the corner map shows where you are. Tap it to jump there." },
      { Icon: Search, name: "Magnifier", what: "A round magnifier follows your pointer (on by default with a mouse). Strength: −, = or Shift + scroll.", keys: ["L"], touch: "Turn on, then drag" },
      { Icon: Hash, name: "Presets", what: "P1–P4 each set a whole look in one tap: Clean, Night hunt, Thermal, Motion.", keys: ["1", "2", "3", "4"] },
      { Icon: SlidersHorizontal, name: "Console", what: "Opens all the looks and tools. Anything that is on also shows in the strip: tap it to turn it off." },
      { Icon: Link, name: "Copy link", what: "Share exactly this view: zoom, turn and looks.", only: "image" },
      { Icon: Link, name: "Copy link", what: "Share this moment, with the same view and looks.", only: "video" },
    ],
  },
  {
    title: "Change the look",
    rows: [
      { Icon: WandSparkles, name: "Enhance", what: "Stronger contrast and colour." },
      { Icon: SunMoon, name: "Invert", what: "Swap light and dark, like a heat camera's black-hot mode.", keys: ["I"] },
      { Icon: DropletOff, name: "Black and white", what: "Drop the colour so shapes stand out." },
      { Icon: MoonStar, name: "Night", what: "Bring out detail in dark night footage." },
      { Icon: Flame, name: "Heat colours", what: "Ironbow and Rainbow colour bright and dark areas, like a thermal camera." },
      { Icon: Focus, name: "Sharpen", what: "Crisper edges." },
      { Icon: Sun, name: "Sliders", what: "Brightness, contrast, colour and shadows. Double-tap a fader to put it back." },
      { Icon: Eye, name: "See the original", what: "Hold the eye to see the file with no changes, to check nothing was added.", keys: ["hold \\"], touch: "Press and hold" },
      { Icon: RotateCcw, name: "Undo looks", what: "Back to the file as it came." },
    ],
  },
  {
    title: "Tools",
    rows: [
      { Icon: Ruler, name: "Ruler", what: "Drag a line to compare sizes and angles. Shows pixels, not real sizes: those aren't known." },
      { Icon: Activity, name: "Motion", what: "Things that move glow; still areas go dark.", only: "video" },
      { Icon: RotateCw, name: "Turn", what: "Turn the picture a quarter.", keys: ["R"] },
      { Icon: ImageDown, name: "Save picture", what: "Download it with your changes.", only: "image" },
      { Icon: Camera, name: "Save frame", what: "Download this frame with your changes.", keys: ["C"], only: "video" },
      { Icon: MessageSquarePlus, name: "Post frame", what: "Start a comment with this frame attached.", only: "video" },
      { Icon: Download, name: "Download video", what: "The original file.", only: "video" },
    ],
  },
  {
    title: "The click wheel",
    wheel: true,
    rows: [
      { Icon: Disc3, name: "Slide the ring", what: "Video: frame by frame. Picture: zoom.", keys: ["←", "→"], touch: "Slide round" },
      { Icon: Play, name: "Press the middle", what: "Video: play or pause. Picture: full view." },
      { Icon: StepForward, name: "Press the sides", what: "Video: one frame back or on. Picture: zoom out or in." },
      { Icon: Gauge, name: "Press the top", what: "Video: speed. Picture: magnifier on or off." },
      { Icon: Repeat1, name: "Press the bottom", what: "Video: loop a part. Picture: turn." },
    ],
  },
  {
    title: "Play the video",
    only: "video",
    rows: [
      { Icon: Play, name: "Play or pause", what: "", keys: ["Space", "K"] },
      { Icon: StepForward, name: "Step one frame", what: "Back or forward one frame at a time.", keys: [",", "."] },
      { Icon: Gauge, name: "Speed", what: "From slow motion (0.1×) to 2×, in the console.", keys: ["[", "]"] },
      { Icon: Repeat, name: "Loop", what: "Play the clip over and over." },
      { Icon: Repeat1, name: "Loop a part", what: "Press for the start, again for the end, a third time to clear.", keys: ["A"] },
      { Icon: VolumeX, name: "Sound", what: "Mute or unmute.", keys: ["M"] },
      { Icon: Maximize, name: "Full screen", what: "Keeps your zoom and looks." },
    ],
  },
  {
    title: "Make it yours",
    rows: [
      { Icon: Palette, name: "Console style", what: "Simple for a quick look, DJ deck for studying footage, Walkman for one thumb on a phone." },
      { Icon: Save, name: "Save a preset", what: "Tap the disk, then P1–P4, to keep your setup there." },
      { Icon: Pencil, name: "Arrange", what: "Drag keys into your own order. Reset puts them back." },
    ],
  },
  {
    title: "Move between files",
    rows: [
      { Icon: ArrowLeftRight, name: "Next or previous file", what: "", keys: ["←", "→"], touch: "Swipe sideways" },
      { Icon: CornerUpLeft, name: "Go back", what: "", keys: ["Esc"], keyboardOnly: true },
    ],
  },
];
```
and change the group filter to `HELP.filter((g) => (!g.only || g.only === media) && (!g.wheel || skin !== "simple"))`.

- [ ] **Step 4: Run tests**

Run: `cd web && npx vitest run src/tests/doc.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/components/MediaHelp.tsx web/src/tests/doc.test.tsx
git commit -m "feat(web): help panel follows the console (strip, looks, tools, wheel, make it yours)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Whole-branch verification

**Files:** none new (fixes only, if anything fails).

- [ ] **Step 1: Static checks and full suite**

Run: `cd web && npx tsc --noEmit -p . && npx oxlint src && npx vitest run && npm run build`
Expected: no type errors, no lint errors, all tests PASS, build succeeds.

- [ ] **Step 2: Browser matrix**

With `worker-dev` and `web-dev` running, for each style (Simple, DJ deck, Walkman) × (`/doc/NASA-UAP-D030` image, `/doc/FBI-UAP-PR003` video) × (desktop, 375px mobile preset):
- strip fits (desktop one line; phone wraps without horizontal scroll: `document.documentElement.scrollWidth <= innerWidth`);
- every console control's `getBoundingClientRect()` is ≥ 36×36 on mobile (≥ 32×32 desktop): run in the page
  `[...document.querySelectorAll('[data-screen=doc] button, [data-screen=doc] [role=slider]')].filter(e=>e.offsetParent).map(e=>{const r=e.getBoundingClientRect();return [e.getAttribute('aria-label'),Math.round(r.width),Math.round(r.height)]}).filter(([,w,h])=>w<36||h<36)` → expect `[]` on mobile (ignore inline text links);
- P1–P4, save to a slot, reload → kept; arrange (drag) → reload → kept; style → reload → kept;
- click wheel slide with the mouse (`left_click_drag` along an arc in several steps) moves frames / zooms; tap presses work;
- next/previous file (→ / ←): A–B and save-preset mode reset, presets kept;
- `?br=120&pal=ironbow&z=2&cx=0.5&cy=0.5` link still opens filtered and zoomed;
- dark and light theme both readable;
- no console errors (`read_console_messages` with `onlyErrors`).

- [ ] **Step 3: Record and commit any fixes**

For each failure: write a failing test that reproduces it in the owning task's test file, fix, re-run Step 1, then:

```bash
git add <the files you changed>
git commit -m "fix(web): <what was wrong in the media console>

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
