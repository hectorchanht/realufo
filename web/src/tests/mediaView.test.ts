import { describe, expect, it } from "vitest";
import { DEFAULT_VIEW, clampView, pointToUV, uvToPoint, viewFromParams, viewToParams, zoomAt } from "../lib/mediaView";

// 400×300 panel, 800×600 picture → drawn 400×300, filling the box.
const box = { w: 400, h: 300 };
const pic = { w: 800, h: 600 };

describe("mediaView", () => {
  it("maps the box centre to the picture centre and edges to 0/1", () => {
    expect(pointToUV(box, 200, 150, pic, DEFAULT_VIEW)).toMatchObject({ u: 0.5, v: 0.5, rw: 400, rh: 300 });
    expect(pointToUV(box, 0, 0, pic, DEFAULT_VIEW)).toMatchObject({ u: 0, v: 0 });
  });

  it("undoes a 90° clockwise rotation (top edge ends up on the right)", () => {
    const view = { ...DEFAULT_VIEW, rot: 90 as const };
    const hit = pointToUV(box, 200 + 1000, 150, pic, view); // far right, middle
    expect(hit.v).toBeLessThan(0); // past the picture's top edge
    const right = pointToUV(box, 200 + 10, 150, pic, view);
    expect(right.u).toBeCloseTo(0.5);
    expect(right.v).toBeLessThan(0.5);
  });

  it("undoes a horizontal flip", () => {
    expect(pointToUV(box, 0, 150, pic, { ...DEFAULT_VIEW, flip: true }).u).toBeCloseTo(1);
  });

  it("zoomAt keeps the point under the cursor fixed", () => {
    const before = pointToUV(box, 300, 100, pic, DEFAULT_VIEW);
    const z = zoomAt(DEFAULT_VIEW, box, pic, 2.5, 300, 100);
    expect(z.z).toBe(2.5);
    const after = pointToUV(box, 300, 100, pic, z);
    expect(after.u).toBeCloseTo(before.u);
    expect(after.v).toBeCloseTo(before.v);
  });

  it("clamps zoom to 1–8 and recentres at 1×", () => {
    expect(zoomAt(DEFAULT_VIEW, box, pic, 100, 0, 0).z).toBe(8);
    expect(clampView({ ...DEFAULT_VIEW, x: 50, y: -20 }, box, pic)).toMatchObject({ x: 0, y: 0 });
  });

  it("view survives a URL round trip (same spot at the panel centre, any panel size)", () => {
    for (const rot of [0, 90, 180, 270] as const) {
      for (const flip of [false, true]) {
        const v = zoomAt({ ...DEFAULT_VIEW, rot, flip }, box, pic, 3, 320, 60);
        const sp = new URLSearchParams("t=4");
        viewToParams(sp, v, box, pic);
        expect(sp.get("t")).toBe("4");
        const other = { w: 600, h: 450 }; // the friend's screen is bigger
        const back = viewFromParams(sp, other, pic)!;
        expect(back).toMatchObject({ rot, flip });
        expect(back.z).toBeCloseTo(3);
        const a = pointToUV(box, box.w / 2, box.h / 2, pic, v);
        const b = pointToUV(other, other.w / 2, other.h / 2, pic, back);
        expect(b.u).toBeCloseTo(a.u, 2);
        expect(b.v).toBeCloseTo(a.v, 2);
      }
    }
  });

  it("default view writes nothing; junk params read as no view", () => {
    const sp = new URLSearchParams();
    viewToParams(sp, DEFAULT_VIEW, box, pic);
    expect(sp.toString()).toBe("");
    expect(viewFromParams(sp, box, pic)).toBeNull();
    expect(viewFromParams(new URLSearchParams("z=abc&rot=45"), box, pic)).toBeNull();
    expect(viewFromParams(new URLSearchParams("z=99"), box, pic)!.z).toBe(8);
  });

  it("uvToPoint undoes pointToUV under any zoom / pan / rotate / flip", () => {
    for (const rot of [0, 90, 180, 270] as const) {
      for (const flip of [false, true]) {
        const v = zoomAt({ ...DEFAULT_VIEW, rot, flip }, box, pic, 2.7, 120, 210);
        const p = uvToPoint(box, 0.3, 0.8, pic, v);
        const back = pointToUV(box, p.x, p.y, pic, v);
        expect(back.u).toBeCloseTo(0.3);
        expect(back.v).toBeCloseTo(0.8);
      }
    }
  });
});
