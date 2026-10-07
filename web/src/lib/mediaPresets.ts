// Console presets P1–P4: a whole look (filters + magnifier + motion) in one
// tap. Shared by all three console styles. Stored on this device only.
// Spec: docs/superpowers/specs/2026-10-04-media-dj-console-design.md
import { adjustFilter } from "../components/ImageTools";
import type { ImageAdjust } from "../components/ImageTools";

export interface Preset {
  slot: 1 | 2 | 3 | 4;
  name: string;
  adjust: ImageAdjust;
  mag: number;
  motion: boolean;
}

// NOTE: DEFAULT_ADJUST lives in components/ImageTools, but importing it
// here would close an import cycle (ImageTools → console/MediaConsole →
// this file → ImageTools) and leave it undefined at module-evaluation time.
// The default look is spelled out literally instead.
const CLEAN_LOOK: ImageAdjust = {
  brightness: 100,
  contrast: 100,
  saturate: 100,
  gamma: 100,
  invert: false,
  gray: false,
  palette: "none",
  sharpen: false,
};

export const DEFAULT_PRESETS: Preset[] = [
  { slot: 1, name: "Clean", adjust: CLEAN_LOOK, mag: 3, motion: false },
  {
    slot: 2,
    name: "Night hunt",
    adjust: { ...CLEAN_LOOK, gamma: 170, contrast: 110, sharpen: true },
    mag: 5,
    motion: false,
  },
  {
    slot: 3,
    name: "Thermal",
    adjust: { ...CLEAN_LOOK, contrast: 120, palette: "ironbow" },
    mag: 3,
    motion: false,
  },
  { slot: 4, name: "Motion", adjust: CLEAN_LOOK, mag: 3, motion: true },
];

const PRESETS_KEY = "ru:media-presets";

function sane(p: unknown): p is Preset {
  if (typeof p !== "object" || p === null) return false;
  const q = p as Record<string, unknown>;
  if (![1, 2, 3, 4].includes(q.slot as number)) return false;
  if (typeof q.name !== "string" || !q.name) return false;
  if (typeof q.mag !== "number" || q.mag <= 0) return false;
  if (typeof q.motion !== "boolean") return false;
  const a = q.adjust as Record<string, unknown> | null;
  if (typeof a !== "object" || a === null) return false;
  for (const k of ["brightness", "contrast", "saturate", "gamma"] as const) {
    if (typeof a[k] !== "number") return false;
  }
  return true;
}

/** Load the four slots; anything corrupt or missing falls back to the defaults. */
export function loadPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { presets?: unknown };
      if (Array.isArray(parsed.presets)) {
        const slots = new Map<number, Preset>();
        for (const p of parsed.presets) if (sane(p)) slots.set(p.slot, { ...p, adjust: { ...p.adjust } });
        if (slots.size > 0) {
          // unknown ids dropped, missing ids appended (new presets appear after an update)
          return [1, 2, 3, 4].map((s) => slots.get(s) ?? { ...DEFAULT_PRESETS[s - 1], adjust: { ...DEFAULT_PRESETS[s - 1].adjust } });
        }
      }
    }
  } catch {
    /* corrupt JSON → defaults */
  }
  return DEFAULT_PRESETS.map((p) => ({ ...p, adjust: { ...p.adjust } }));
}

export function savePresets(presets: Preset[]) {
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify({ v: 1, presets }));
  } catch {
    /* private mode etc.: the choice lasts for this page only */
  }
}

/** Does the current setup equal the preset? (motion is ignored for images.) */
export function presetMatches(p: Preset, adjust: ImageAdjust, mag: number, motion: boolean, media: "image" | "video"): boolean {
  return adjustFilter(p.adjust) === adjustFilter(adjust) && p.mag === mag && (media === "image" || p.motion === motion);
}
