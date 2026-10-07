// Effect definitions shared by the three console styles: Simple chips, DJ
// pads and Walkman white keys all drive the same looks. Semantics match the
// original toolbar: the four tone presets toggle against the tone defaults,
// palettes and sharpen toggle independently.
import { DropletOff, Flame, Focus, MoonStar, Rainbow, SunMoon, WandSparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { adjustFilter } from "../ImageTools";
import type { ImageAdjust } from "../ImageTools";

/** Tone keys a preset sets; palette + sharpen stay as they are. */
export const TONE_RESET = { brightness: 100, contrast: 100, saturate: 100, gamma: 100, invert: false, gray: false } as const;

export interface EffectDef {
  id: string;
  label: string;
  Icon: LucideIcon;
  active(adjust: ImageAdjust): boolean;
  next(adjust: ImageAdjust): ImageAdjust;
}

function tonePreset(label: string, Icon: LucideIcon, adj: Partial<ImageAdjust>): EffectDef {
  const apply = (a: ImageAdjust): ImageAdjust => ({ ...a, ...TONE_RESET, ...adj });
  return {
    id: label.toLowerCase().replace(/[^a-z]+/g, "-"),
    label,
    Icon,
    active: (a) => adjustFilter(apply(a)) === adjustFilter(a),
    next: (a) => (adjustFilter(apply(a)) === adjustFilter(a) ? { ...a, ...TONE_RESET } : apply(a)),
  };
}

export const EFFECTS: EffectDef[] = [
  tonePreset("Enhance", WandSparkles, { brightness: 110, contrast: 140, saturate: 120 }),
  tonePreset("Invert IR", SunMoon, { invert: true }),
  tonePreset("B&W", DropletOff, { contrast: 120, gray: true }),
  tonePreset("Night", MoonStar, { gamma: 170, contrast: 110 }),
  {
    id: "ironbow",
    label: "Ironbow",
    Icon: Flame,
    active: (a) => a.palette === "ironbow",
    next: (a) => ({ ...a, palette: a.palette === "ironbow" ? "none" : "ironbow" }),
  },
  {
    id: "rainbow",
    label: "Rainbow",
    Icon: Rainbow,
    active: (a) => a.palette === "rainbow",
    next: (a) => ({ ...a, palette: a.palette === "rainbow" ? "none" : "rainbow" }),
  },
  {
    id: "sharpen",
    label: "Sharpen",
    Icon: Focus,
    active: (a) => a.sharpen,
    next: (a) => ({ ...a, sharpen: !a.sharpen }),
  },
];

export const effectById = (id: string) => EFFECTS.find((e) => e.id === id);
