// Unit tests: console skin + preset storage (both localStorage, this device).
import { beforeEach, describe, expect, it } from "vitest";
import { loadSkin, saveSkin } from "../lib/mediaSkin";
import { DEFAULT_ADJUST } from "../components/ImageTools";
import { DEFAULT_PRESETS, loadPresets, presetMatches, savePresets } from "../lib/mediaPresets";
import type { Preset } from "../lib/mediaPresets";

beforeEach(() => localStorage.clear());

describe("media skin", () => {
  it("defaults to simple for new visitors, round-trips the choice", () => {
    expect(loadSkin()).toBe("simple");
    saveSkin("chaban");
    expect(loadSkin()).toBe("chaban");
  });
  it("unknown values fall back to simple", () => {
    localStorage.setItem("ru:media-skin", "ipod");
    expect(loadSkin()).toBe("simple");
  });
});

describe("presets", () => {
  it("ships the four documented defaults", () => {
    expect(DEFAULT_PRESETS.map((p) => p.name)).toEqual(["Clean", "Night hunt", "Thermal", "Motion"]);
    expect(DEFAULT_PRESETS[1].adjust.gamma).toBe(170);
    expect(DEFAULT_PRESETS[2].adjust.palette).toBe("ironbow");
    expect(DEFAULT_PRESETS[3].motion).toBe(true);
  });
  it("round-trips saved slots", () => {
    const mine: Preset[] = DEFAULT_PRESETS.map((p) => ({ ...p, adjust: { ...p.adjust } }));
    mine[0] = { ...mine[0], name: "Your setup", adjust: { ...DEFAULT_ADJUST, brightness: 130 }, mag: 5 };
    savePresets(mine);
    const back = loadPresets();
    expect(back[0].name).toBe("Your setup");
    expect(back[0].adjust.brightness).toBe(130);
    expect(back[0].mag).toBe(5);
    expect(back[1].name).toBe("Night hunt"); // untouched slots survive
  });
  it("corrupt storage falls back to the defaults", () => {
    localStorage.setItem("ru:media-presets", "{not json");
    expect(loadPresets().map((p) => p.slot)).toEqual([1, 2, 3, 4]);
    localStorage.setItem("ru:media-presets", JSON.stringify({ presets: [{ slot: 9, name: "x" }] }));
    expect(loadPresets().map((p) => p.slot)).toEqual([1, 2, 3, 4]);
  });
  it("missing slots are filled from the defaults", () => {
    savePresets([{ ...DEFAULT_PRESETS[0], name: "Mine", adjust: { ...DEFAULT_PRESETS[0].adjust } }]);
    const back = loadPresets();
    expect(back[0].name).toBe("Mine");
    expect(back[3].name).toBe("Motion");
  });
  it("matches() compares look + mag (+ motion on video)", () => {
    const p = DEFAULT_PRESETS[0];
    expect(presetMatches(p, DEFAULT_ADJUST, 3, false, "video")).toBe(true);
    expect(presetMatches(p, DEFAULT_ADJUST, 5, false, "video")).toBe(false);
    expect(presetMatches(p, { ...DEFAULT_ADJUST, brightness: 120 }, 3, false, "video")).toBe(false);
    expect(presetMatches(DEFAULT_PRESETS[3], DEFAULT_ADJUST, 3, false, "video")).toBe(false); // motion on, off
    expect(presetMatches(DEFAULT_PRESETS[3], DEFAULT_ADJUST, 3, true, "video")).toBe(true);
    expect(presetMatches(DEFAULT_PRESETS[3], DEFAULT_ADJUST, 3, false, "image")).toBe(true); // images ignore motion
  });
});
