import { describe, expect, it } from "vitest";
import { motionMap } from "../components/MotionLayer";

const px = (...rgba: number[][]) => new Uint8ClampedArray(rgba.flat());

describe("motionMap", () => {
  it("still pixels go dim grey, changed pixels glow in the given colour", () => {
    const prev = px([100, 100, 100, 255], [20, 20, 20, 255]);
    const cur = px([100, 100, 100, 255], [240, 240, 240, 255]);
    const out = new Uint8ClampedArray(8);
    motionMap(cur, prev, out, [0, 255, 0]);
    expect([...out.slice(0, 4)]).toEqual([30, 30, 30, 255]); // unchanged: 30% of its grey
    expect(out[5]).toBe(255); // big change: full glow
    expect(out[4]).toBeLessThan(10);
  });

  it("small changes (sensor noise) and no previous frame show no glow", () => {
    const out = new Uint8ClampedArray(4);
    motionMap(px([105, 105, 105, 255]), px([100, 100, 100, 255]), out, [0, 255, 0]);
    expect(Math.abs(out[1] - 31.5)).toBeLessThanOrEqual(0.5); // 30% of 105, no green
    expect(out[0]).toBe(out[1]);
    motionMap(px([200, 200, 200, 255]), null, out, [0, 255, 0]);
    expect([...out]).toEqual([60, 60, 60, 255]);
  });
});
