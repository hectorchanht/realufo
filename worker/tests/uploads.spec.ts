import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index";
import { seedTestDB } from "./helpers";

beforeAll(() => seedTestDB(env.DB));
const call = (p: string, init?: RequestInit) => worker.fetch(new Request("https://x" + p, init), env as any, {} as any);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const form = (fields: Record<string, string>, bytes: Uint8Array, type = "image/png") => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  f.set("image", new File([bytes], "x.png", { type }));
  return call(fields.body ? "/api/threads/t1/posts" : "/api/threads", { method: "POST", headers: { "X-Anon-Id": "up1" }, body: f });
};

describe("image uploads", () => {
  it("new thread with image: stored, counted, served same-origin", async () => {
    const r = await form({ board: "uap", op_body: "with pic" }, PNG);
    expect(r.status).toBe(201);
    const { thread }: any = await r.json();
    expect(thread.img_count).toBe(1);

    const det: any = await (await call("/api/threads/" + thread.id)).json();
    const url = det.posts[0].image_url;
    expect(url).toMatch(/^\/api\/u\/[0-9a-f-]{36}\.png$/);
    expect(det.posts[0].image_kind).toBe("upload");

    const board: any = await (await call("/api/boards/uap/threads")).json();
    const card = board.threads.find((t: any) => t.id === thread.id);
    expect(card.thumb).toBe(url);
    expect(card).not.toHaveProperty("thumbKey");

    const img = await call(url);
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/png");
    expect(img.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await img.arrayBuffer())).toEqual(PNG);
  });

  it("reply with image bumps thread img_count", async () => {
    const before: any = await (await call("/api/threads/t1")).json();
    const r = await form({ body: "reply pic" }, PNG);
    expect(r.status).toBe(201);
    expect(((await r.json()) as any).post.image_url).toMatch(/^\/api\/u\//);
    const after: any = await (await call("/api/threads/t1")).json();
    expect(after.thread.img_count).toBe(before.thread.img_count + 1);
  });

  it("rejects non-images by content, ignoring claimed type", async () => {
    const svg = new TextEncoder().encode("<svg onload=alert(1)>");
    const r = await form({ board: "uap", op_body: "evil" }, svg, "image/png");
    expect(r.status).toBe(400);
  });

  it("rejects images over 8 MB", async () => {
    const big = new Uint8Array(8 * 1024 * 1024 + 1);
    big.set(PNG);
    expect((await form({ board: "uap", op_body: "big" }, big)).status).toBe(413);
  });

  it("serve route only reaches uploads/", async () => {
    expect((await call("/api/u/..%2Fsecret.png")).status).toBe(404);
    expect((await call("/api/u/00000000-0000-0000-0000-000000000000.png")).status).toBe(404);
  });
});

// Phone photos carry EXIF/XMP GPS. Every fixture hides SECRET in the metadata;
// served bytes must not contain it, while the pixel data must survive intact.
const enc = (s: string) => new TextEncoder().encode(s);
const cat = (...xs: (Uint8Array | number[])[]) => {
  const out = new Uint8Array(xs.reduce((n, x) => n + x.length, 0));
  let o = 0;
  for (const x of xs) out.set(x, (o += x.length) - x.length);
  return out;
};
const be16 = (n: number) => [n >> 8, n & 255];
const be32 = (n: number) => [n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255];
const le32 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, n >>> 24];
const SECRET = enc("LAT-37.2431");
const has = (hay: Uint8Array, needle: Uint8Array) =>
  hay.some((_, i) => needle.every((x, j) => hay[i + j] === x));
const served = async (r: Response) => {
  const { thread }: any = await r.json();
  const det: any = await (await call("/api/threads/" + thread.id)).json();
  return new Uint8Array(await (await call(det.posts[0].image_url)).arrayBuffer());
};
const seg = (marker: number, body: Uint8Array) => cat([0xff, marker], be16(body.length + 2), body);
// EXIF APP1: IFD0 = Orientation + GPSInfo pointer; the GPS IFD holds SECRET.
const exif = (le: boolean, orientation: number) => {
  const u16 = (n: number) => (le ? [n & 255, n >> 8] : be16(n));
  const u32 = (n: number) => (le ? le32(n) : be32(n));
  const tiff = cat(
    le ? enc("II") : enc("MM"), u16(42), u32(8),
    u16(2),
    u16(0x0112), u16(3), u32(1), u16(orientation), u16(0),
    u16(0x8825), u16(4), u32(1), u32(38),
    u32(0),
    u16(1), u16(2), u16(2), u32(SECRET.length), u32(56), u32(0),
    SECRET,
  );
  return seg(0xe1, cat(enc("Exif\0\0"), tiff));
};
// Walk segment lengths like a decoder; a bad length field won't land on SOS.
const reachesScan = (b: Uint8Array) => {
  let i = 2;
  while (i + 4 <= b.length && b[i] === 0xff && b[i + 1] !== 0xda) i += 2 + ((b[i + 2] << 8) | b[i + 3]);
  return b[i] === 0xff && b[i + 1] === 0xda;
};
const SCAN = cat([0xff, 0xda], be16(8), [1, 1, 0, 0, 63, 0], enc("PIXELS"), [0xff, 0xd9]);
const jpeg = (le: boolean, orientation = 6) =>
  cat(
    [0xff, 0xd8],
    seg(0xe0, enc("JFIF\0\x01\x01\0\0\x01\0\x01\0\0")),
    exif(le, orientation),
    seg(0xe1, cat(enc("http://ns.adobe.com/xap/1.0/\0<x>"), SECRET, enc("</x>"))),
    seg(0xdb, new Uint8Array([0, 1, 2])),
    SCAN,
  );

describe("upload metadata stripping", () => {
  it("JPEG: drops EXIF GPS + XMP, keeps orientation and pixels", async () => {
    const out = await served(await form({ board: "uap", op_body: "jpg" }, jpeg(false), "image/jpeg"));
    expect(has(out, SECRET)).toBe(false);
    expect(has(out, enc("Exif\0\0"))).toBe(true);
    expect(has(out, new Uint8Array([0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6]))).toBe(true); // Orientation=6, MM
    expect(has(out, SCAN)).toBe(true);
    expect(has(out, enc("JFIF"))).toBe(true);
    expect(reachesScan(out)).toBe(true);
  });

  it("JPEG: reads little-endian (II) orientation", async () => {
    const out = await served(await form({ board: "uap", op_body: "jpg-ii" }, jpeg(true, 8), "image/jpeg"));
    expect(has(out, SECRET)).toBe(false);
    expect(has(out, new Uint8Array([0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 8]))).toBe(true);
  });

  it("JPEG: orientation 1 leaves no EXIF at all", async () => {
    const out = await served(await form({ board: "uap", op_body: "jpg-1" }, jpeg(false, 1), "image/jpeg"));
    expect(has(out, enc("Exif"))).toBe(false);
    expect(has(out, SCAN)).toBe(true);
  });

  it("PNG: drops eXIf and text chunks, keeps image chunks", async () => {
    const chunk = (type: string, data: Uint8Array) => cat(be32(data.length), enc(type), data, [0, 0, 0, 0]);
    const IHDR = chunk("IHDR", new Uint8Array(13));
    const IDAT = chunk("IDAT", enc("PIXELS"));
    const IEND = chunk("IEND", new Uint8Array());
    const png = cat(PNG.slice(0, 8), IHDR, chunk("eXIf", SECRET), chunk("tEXt", cat(enc("gps\0"), SECRET)), chunk("iTXt", SECRET), IDAT, IEND);
    const out = await served(await form({ board: "uap", op_body: "png" }, png));
    expect(out).toEqual(cat(PNG.slice(0, 8), IHDR, IDAT, IEND));
  });

  it("WebP: drops EXIF/XMP chunks, clears VP8X flags, fixes RIFF size", async () => {
    const chunk = (type: string, data: Uint8Array) =>
      cat(enc(type), le32(data.length), data, data.length % 2 ? [0] : []);
    const vp8x = (flags: number) => chunk("VP8X", new Uint8Array([flags, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
    const VP8L = chunk("VP8L", enc("PIXELS!"));
    const riff = (...cs: Uint8Array[]) => {
      const body = cat(enc("WEBP"), ...cs);
      return cat(enc("RIFF"), le32(body.length), body);
    };
    const webp = riff(vp8x(0x10 | 0x08 | 0x04), VP8L, chunk("EXIF", SECRET), chunk("XMP ", SECRET));
    const out = await served(await form({ board: "uap", op_body: "webp" }, webp, "image/webp"));
    expect(out).toEqual(riff(vp8x(0x10), VP8L));
  });
});
