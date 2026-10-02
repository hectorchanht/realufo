import { describe, it, expect, vi, afterEach } from "vitest";
import { oauth1Header, createPost, uploadMedia, mediaStatus, XError, CHUNK, type XSecrets } from "../lib/x";

// X's published "Creating a signature" example (docs.x.com); verified with an
// independent HMAC-SHA1 computation → hCtSmYh+iHYCEqBWrE7C7hYmtUk=
const EX: XSecrets = {
  X_API_KEY: "xvz1evFS4wEEPTGEFPHBog",
  X_API_SECRET: "kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw",
  X_ACCESS_TOKEN: "370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb",
  X_ACCESS_SECRET: "LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE",
};

type Call = { method: string; url: string; body: unknown; auth: string };
let calls: Call[] = [];
function mockX(handler: (c: Call) => { status?: number; json?: unknown }) {
  calls = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init: any = {}) => {
    const c = { method: init.method ?? "GET", url: String(input), body: init.body, auth: init.headers?.Authorization ?? "" };
    calls.push(c);
    const r = handler(c);
    return new Response(r.json === undefined ? "" : JSON.stringify(r.json), { status: r.status ?? 200 });
  });
}
afterEach(() => vi.restoreAllMocks());

const src = (size: number) => ({
  size,
  read: async (offset: number, length: number) => new Uint8Array(length).fill(offset % 251).buffer,
});
const noSleep = async () => {};

describe("oauth1Header", () => {
  it("matches X's published signature example", async () => {
    const h = await oauth1Header(
      "POST", "https://api.twitter.com/1.1/statuses/update.json?include_entities=true", EX,
      { status: "Hello Ladies + Gentlemen, a signed OAuth request!" },
      "kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg", "1318622958",
    );
    expect(h).toMatch(/^OAuth /);
    expect(h).toContain('oauth_signature="hCtSmYh%2BiHYCEqBWrE7C7hYmtUk%3D"');
    expect(h).toContain('oauth_consumer_key="xvz1evFS4wEEPTGEFPHBog"');
  });
});

describe("createPost", () => {
  it("posts JSON text + media ids and returns the tweet id", async () => {
    mockX(() => ({ status: 201, json: { data: { id: "777", text: "hi" } } }));
    expect(await createPost(EX, "hi", ["m1"])).toBe("777");
    expect(calls[0].url).toBe("https://api.x.com/2/tweets");
    expect(JSON.parse(calls[0].body as string)).toEqual({ text: "hi", media: { media_ids: ["m1"] } });
    expect(calls[0].auth).toMatch(/^OAuth .*oauth_signature="/);
  });
  it("throws XError with status on 4xx", async () => {
    mockX(() => ({ status: 403, json: { detail: "duplicate content" } }));
    const e = await createPost(EX, "hi").catch((e) => e);
    expect(e).toBeInstanceOf(XError);
    expect(e.status).toBe(403);
    expect(e.body).toContain("duplicate");
  });
});

describe("uploadMedia", () => {
  it("initialize → one append per 4 MB chunk → finalize → status until succeeded", async () => {
    let polls = 0;
    mockX((c) => {
      if (c.url.endsWith("/initialize")) return { json: { data: { id: "M1" } } };
      if (c.url.includes("/append")) return {};
      if (c.url.endsWith("/finalize")) return { json: { data: { id: "M1", processing_info: { state: "pending", check_after_secs: 1 } } } };
      polls++;
      return { json: { data: { processing_info: { state: polls < 2 ? "in_progress" : "succeeded" } } } };
    });
    const up = await uploadMedia(EX, src(CHUNK * 2 + 10), "video/mp4", { sleep: noSleep });
    expect(up).toEqual({ mediaId: "M1", ready: true });
    const init = JSON.parse(calls[0].body as string);
    expect(init).toEqual({ media_type: "video/mp4", total_bytes: CHUNK * 2 + 10, media_category: "tweet_video" });
    const appends = calls.filter((c) => c.url.includes("/append"));
    expect(appends.map((c) => (c.body as FormData).get("segment_index"))).toEqual(["0", "1", "2"]);
    expect(((appends[2].body as FormData).get("media") as Blob).size).toBe(10);
    expect(calls.at(-1)!.url).toBe("https://api.x.com/2/media/upload?command=STATUS&media_id=M1");
  });
  it("images skip STATUS when finalize returns no processing_info", async () => {
    mockX(() => ({ json: { data: { id: "I1" } } }));
    expect(await uploadMedia(EX, src(1000), "image/jpeg", { sleep: noSleep })).toEqual({ mediaId: "I1", ready: true });
    expect(JSON.parse(calls[0].body as string).media_category).toBe("tweet_image");
    expect(calls.some((c) => c.url.includes("STATUS"))).toBe(false);
  });
  it("returns ready:false after maxWaitMs instead of blocking the tick", async () => {
    mockX((c) =>
      c.url.endsWith("/initialize") ? { json: { data: { id: "M2" } } }
      : c.url.includes("/append") ? {}
      : { json: { data: { processing_info: { state: "in_progress", check_after_secs: 20 } } } });
    expect(await uploadMedia(EX, src(10), "video/mp4", { sleep: noSleep, maxWaitMs: 30_000 })).toEqual({ mediaId: "M2", ready: false });
  });
  it("throws when processing fails", async () => {
    mockX((c) =>
      c.url.endsWith("/initialize") ? { json: { data: { id: "M3" } } }
      : c.url.includes("/append") ? {}
      : { json: { data: { processing_info: { state: "failed", error: { message: "bad codec" } } } } });
    await expect(uploadMedia(EX, src(10), "video/mp4", { sleep: noSleep })).rejects.toThrow(/bad codec/);
  });
});

describe("mediaStatus", () => {
  it("maps processing_info.state", async () => {
    mockX(() => ({ json: { data: { processing_info: { state: "in_progress" } } } }));
    expect(await mediaStatus(EX, "M")).toBe("pending");
    mockX(() => ({ json: { data: {} } }));
    expect(await mediaStatus(EX, "M")).toBe("succeeded");
  });
});
