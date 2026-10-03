import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { seedTestDB } from "./helpers";
import { tick } from "../lib/social/tick";
import { SocialError, type Adapter, type SocialPost } from "../lib/social/common";

// seeded: records.archive → archives and assets.record_id → records are FKs
beforeAll(() => seedTestDB(env.DB));

const NOW = new Date("2026-10-10T15:00:00Z");
const noSleep = async () => {};
const OFF = { FEATURE_SOCIAL_FB: "off", FEATURE_SOCIAL_IG: "off", FEATURE_SOCIAL_THREADS: "off", FEATURE_SOCIAL_BSKY: "off", FEATURE_SOCIAL_YT: "off", FEATURE_SOCIAL_TIKTOK: "off" };
const E = (extra: Record<string, unknown> = {}) => ({ ...env, ...OFF, SOCIAL_SINCE: "2026-10-01", YT_DAILY_MAX: "5", ...extra }) as any;

let seen: { platform: string; p: SocialPost }[] = [];
const fake = (platform: string, o: Partial<Adapter> = {}): Adapter => ({
  needs: "any", vertical: false, configured: () => true,
  publish: async (_e, p) => { seen.push({ platform, p }); return { remoteId: `R-${platform}` }; },
  ...o,
});

const addX = async (ref: string, opts: { status?: string; media?: string | null; created?: string; text?: string } = {}) =>
  (await env.DB.prepare("INSERT INTO x_posts(stream,ref,text,ai,media,cost_usd,status,created_at) VALUES ('pick',?,?,1,?,0.2,?,?) RETURNING id")
    .bind(ref, opts.text ?? `📼 ${ref}\nhttps://realufo.org/doc/${ref}`, opts.media === undefined ? `clip:clips/wargov/${ref}.mp4` : opts.media, opts.status ?? "posted", opts.created ?? "2026-10-10 14:00:00")
    .first<{ id: number }>())!.id;
// live rows only; soft-deleted ones (deleted_at) are history
const rows = async () => (await env.DB.prepare("SELECT platform, status, remote_id, container_id, error, attempts FROM social_posts WHERE deleted_at IS NULL ORDER BY id").all<any>()).results;

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM social_posts").run();
  await env.DB.prepare("DELETE FROM x_posts").run();
  await env.DB.prepare("DELETE FROM assets WHERE record_id LIKE 'ST-%'").run();
  await env.DB.prepare("DELETE FROM records WHERE id LIKE 'ST-%'").run();
  for (const p of ["clips/", "clips-v/", "thumbs/"]) for (const o of (await env.MEDIA.list({ prefix: p })).objects) await env.MEDIA.delete(o.key);
  await env.MEDIA.put("clips/wargov/ST-V1.mp4", new Uint8Array(100));
  await env.MEDIA.put("clips-v/wargov/ST-V1.mp4", new Uint8Array(120));
  seen = [];
});

describe("social tick", () => {
  it("off: nothing", async () => {
    await addX("ST-V1");
    await tick(E(), NOW, noSleep, { fb: fake("fb") });
    expect(await rows()).toEqual([]);
  });

  it("empty SOCIAL_SINCE mirrors nothing; rows before SOCIAL_SINCE are ignored", async () => {
    await addX("ST-V1", { created: "2026-09-30 10:00:00" });
    await tick(E({ FEATURE_SOCIAL_FB: "on" }), NOW, noSleep, { fb: fake("fb") });
    await tick(E({ FEATURE_SOCIAL_FB: "on", SOCIAL_SINCE: "" }), NOW, noSleep, { fb: fake("fb") });
    expect(await rows()).toEqual([]);
  });

  it("dry: draft rows, no publish", async () => {
    await addX("ST-V1");
    await tick(E({ FEATURE_SOCIAL_FB: "dry", FEATURE_SOCIAL_BSKY: "dry" }), NOW, noSleep, { fb: fake("fb"), bsky: fake("bsky") });
    expect((await rows()).map((r) => [r.platform, r.status])).toEqual([["fb", "draft"], ["bsky", "draft"]]);
    expect(seen).toEqual([]);
  });

  it("on: fans out with per-platform text and media; second tick posts nothing new", async () => {
    await addX("ST-V1");
    const A = { fb: fake("fb"), ig: fake("ig", { vertical: true, needs: "media" }) };
    const e = E({ FEATURE_SOCIAL_FB: "on", FEATURE_SOCIAL_IG: "on" });
    await tick(e, NOW, noSleep, A);
    await tick(e, NOW, noSleep, A);
    expect(await rows()).toMatchObject([{ platform: "fb", status: "posted", remote_id: "R-fb" }, { platform: "ig", status: "posted", remote_id: "R-ig" }]);
    expect(seen).toHaveLength(2);
    expect(seen[0].p.media).toMatchObject({ kind: "video", key: "clips/wargov/ST-V1.mp4", size: 100 });
    expect(seen[0].p.media!.url).toMatch(/^https:\/\/assets\.realufo\.org\/clips\/wargov\/ST-V1\.mp4\?v=\w{8}$/);
    expect(seen[0].p.text).toContain("\n\nhttps://realufo.org/doc/ST-V1\n\n#UFO #UAP");
    expect(seen[1].p.media!.key).toBe("clips-v/wargov/ST-V1.mp4");
    expect(seen[1].p.text).toContain("🔗 link in bio");
  });

  it("X rows not yet posted (pending/processing) are not mirrored, and X can still delete them", async () => {
    const pend = await addX("ST-V1", { status: "pending" });
    await addX("ST-V2", { status: "processing" });
    await tick(E({ FEATURE_SOCIAL_FB: "on" }), NOW, noSleep, { fb: fake("fb") });
    expect(await rows()).toEqual([]);
    // xbot deletes a pending row on 401/402/403; no social_posts row may block that (FK)
    await env.DB.prepare("DELETE FROM x_posts WHERE id=?").bind(pend).run();
  });

  it("finish errors never re-publish or delete: 429/auth stay processing, 422 fails, timeout still applies", async () => {
    await addX("ST-V1");
    let pubs = 0;
    let err: unknown = new SocialError(429, "slow");
    const A = { tiktok: fake("tiktok", { publish: async () => { pubs++; return { containerId: "P1" }; }, finish: async () => { throw err; } }) };
    const e = E({ FEATURE_SOCIAL_TIKTOK: "on" });
    await tick(e, NOW, noSleep, A);
    await tick(e, new Date("2026-10-10T15:10:00Z"), noSleep, A);
    err = new SocialError(401, "expired");
    await tick(e, new Date("2026-10-10T15:20:00Z"), noSleep, A);
    expect(pubs).toBe(1);
    expect(await rows()).toMatchObject([{ status: "processing", container_id: "P1" }]);
    await tick(e, new Date("2026-10-10T16:30:00Z"), noSleep, A);
    expect(await rows()).toMatchObject([{ status: "failed", error: "processing timeout" }]);

    await env.DB.prepare("DELETE FROM social_posts").run();
    err = new SocialError(422, "tiktok file_format_check_failed");
    await tick(e, NOW, noSleep, A);
    await tick(e, new Date("2026-10-10T15:10:00Z"), noSleep, A);
    expect(pubs).toBe(2);
    expect((await rows())[0]).toMatchObject({ status: "failed" });
    expect((await rows())[0].error).toContain("file_format_check_failed");
  });

  it("one per platform per tick, oldest first; failed X rows never mirrored", async () => {
    await addX("ST-BAD", { status: "failed" });
    await addX("ST-V1", { created: "2026-10-10 10:00:00" });
    await addX("ST-V2", { created: "2026-10-10 11:00:00", media: null });
    await tick(E({ FEATURE_SOCIAL_FB: "on" }), NOW, noSleep, { fb: fake("fb") });
    expect(seen.map((s) => s.p.link)).toEqual(["https://realufo.org/doc/ST-V1"]);
    await tick(E({ FEATURE_SOCIAL_FB: "on" }), NOW, noSleep, { fb: fake("fb") });
    await tick(E({ FEATURE_SOCIAL_FB: "on" }), NOW, noSleep, { fb: fake("fb") });
    expect(seen.map((s) => s.p.link)).toEqual(["https://realufo.org/doc/ST-V1", "https://realufo.org/doc/ST-V2"]);
  });

  it("video-only platform without video → failed 'no video', no publish", async () => {
    await addX("ST-P1", { media: null });
    await tick(E({ FEATURE_SOCIAL_YT: "on" }), NOW, noSleep, { yt: fake("yt", { needs: "video", vertical: true }) });
    expect(await rows()).toMatchObject([{ platform: "yt", status: "failed", error: "no video" }]);
    expect(seen).toEqual([]);
  });

  it("missing vertical twin: ig falls back to the thumb, yt records no video", async () => {
    await env.DB.prepare("INSERT INTO records(id,archive,kind,title,status) VALUES ('ST-V9','wargov','video','x','live')").run();
    await env.DB.prepare("INSERT INTO assets(record_id,role,cdn_url,mime) VALUES ('ST-V9','thumb','https://assets.realufo.org/thumbs/wargov/ST-V9.jpg','image/jpeg')").run();
    await env.MEDIA.put("clips/wargov/ST-V9.mp4", new Uint8Array(100));
    await env.MEDIA.put("thumbs/wargov/ST-V9.jpg", new Uint8Array(50));
    await addX("ST-V9");
    await tick(E({ FEATURE_SOCIAL_IG: "on", FEATURE_SOCIAL_YT: "on" }), NOW, noSleep,
      { ig: fake("ig", { vertical: true, needs: "media" }), yt: fake("yt", { vertical: true, needs: "video" }) });
    expect(seen[0].p.media).toMatchObject({ kind: "image", key: "thumbs/wargov/ST-V9.jpg", size: 50 });
    expect(seen[0].p.media!.url).toMatch(/^https:\/\/assets\.realufo\.org\/thumbs\/wargov\/ST-V9\.jpg\?v=\w{8}$/);
    expect(await rows()).toMatchObject([{ platform: "ig", status: "posted" }, { platform: "yt", status: "failed", error: "no video" }]);
  });

  it("yt over YT_DAILY_MAX → skipped with no row, posted once the 24 h window frees", async () => {
    const e = E({ FEATURE_SOCIAL_YT: "on", YT_DAILY_MAX: "1" });
    const A = { yt: fake("yt", { needs: "video", vertical: true }) };
    await addX("ST-V1", { created: "2026-10-10 10:00:00" });
    await env.MEDIA.put("clips-v/wargov/ST-V2.mp4", new Uint8Array(1));
    await addX("ST-V2", { created: "2026-10-10 11:00:00", media: "clip:clips/wargov/ST-V2.mp4" });
    await tick(e, NOW, noSleep, A);
    await tick(e, NOW, noSleep, A);
    expect((await rows()).map((r) => [r.status, r.error])).toEqual([["posted", null]]);
    await tick(e, new Date(NOW.getTime() + 25 * 3600_000), noSleep, A);
    expect((await rows()).map((r) => r.status)).toEqual(["posted", "posted"]);
  });

  it("container: processing → resumed to posted next tick; >1 h → processing timeout", async () => {
    await addX("ST-V1");
    let state: "processing" | { remoteId: string } = "processing";
    const A = { ig: fake("ig", { publish: async () => ({ containerId: "C1" }), finish: async () => state }) };
    const e = E({ FEATURE_SOCIAL_IG: "on" });
    await tick(e, NOW, noSleep, A);
    expect(await rows()).toMatchObject([{ status: "processing", container_id: "C1" }]);
    await tick(e, new Date("2026-10-10T15:30:00Z"), noSleep, A);
    expect((await rows())[0].status).toBe("processing");
    state = { remoteId: "IGP" };
    await tick(e, new Date("2026-10-10T15:40:00Z"), noSleep, A);
    expect(await rows()).toMatchObject([{ status: "posted", remote_id: "IGP" }]);

    await env.DB.prepare("DELETE FROM social_posts").run();
    state = "processing";
    await tick(e, NOW, noSleep, A);
    await tick(e, new Date("2026-10-10T16:01:00Z"), noSleep, A);
    expect(await rows()).toMatchObject([{ status: "failed", error: "processing timeout" }]);
  });

  it("auth error soft-deletes the row (kept as history; item retried after the fix)", async () => {
    await addX("ST-V1");
    const A = { fb: fake("fb", { publish: async () => { throw new SocialError(400, '{"error":{"code":190}}'); } }) };
    await tick(E({ FEATURE_SOCIAL_FB: "on" }), NOW, noSleep, A);
    expect(await rows()).toEqual([]);
    expect((await env.DB.prepare("SELECT count(*) n FROM social_posts WHERE deleted_at IS NOT NULL").first<any>()).n).toBe(1);
  });

  it("a soft-deleted row is posted again; the old row stays as history", async () => {
    await addX("ST-V1");
    const A = { fb: fake("fb") };
    const e = E({ FEATURE_SOCIAL_FB: "on" });
    await tick(e, NOW, noSleep, A);
    await env.DB.prepare("UPDATE social_posts SET deleted_at=datetime('now')").run();
    await tick(e, NOW, noSleep, A);
    expect(seen).toHaveLength(2);
    expect(await rows()).toMatchObject([{ platform: "fb", status: "posted" }]);
    expect((await env.DB.prepare("SELECT count(*) n FROM social_posts").first<any>()).n).toBe(2);
  });

  it("429 retries up to 3 attempts, then failed; other 4xx fail at once", async () => {
    await addX("ST-V1");
    let n = 0;
    const A = { fb: fake("fb", { publish: async () => { n++; throw new SocialError(429, "slow down"); } }) };
    const e = E({ FEATURE_SOCIAL_FB: "on" });
    await tick(e, NOW, noSleep, A);
    expect(await rows()).toMatchObject([{ status: "pending", attempts: 1 }]);
    await tick(e, NOW, noSleep, A);
    await tick(e, NOW, noSleep, A);
    expect(await rows()).toMatchObject([{ status: "failed", attempts: 3 }]);
    expect(n).toBe(3);

    await env.DB.prepare("DELETE FROM social_posts").run();
    const B = { fb: fake("fb", { publish: async () => { throw new SocialError(400, "bad media"); } }) };
    await tick(e, NOW, noSleep, B);
    expect(await rows()).toMatchObject([{ status: "failed", attempts: 1 }]);
  });

  it("ambiguous network error parks the row and the next tick does not re-post", async () => {
    await addX("ST-V1");
    let n = 0;
    const A = { fb: fake("fb", { publish: async () => { n++; throw new TypeError("network connection lost"); } }) };
    const e = E({ FEATURE_SOCIAL_FB: "on" });
    await tick(e, NOW, noSleep, A);
    await tick(e, NOW, noSleep, A);
    expect(n).toBe(1);
    expect(await rows()).toMatchObject([{ status: "pending", attempts: 0 }]);
  });

  it("one platform throwing doesn't stop the others; unconfigured 'on' platform is skipped", async () => {
    await addX("ST-V1");
    const A = {
      fb: fake("fb", { configured: () => { throw new Error("boom"); } }),
      threads: fake("threads", { configured: () => false }),
      bsky: fake("bsky"),
    };
    await tick(E({ FEATURE_SOCIAL_FB: "on", FEATURE_SOCIAL_THREADS: "on", FEATURE_SOCIAL_BSKY: "on" }), NOW, noSleep, A);
    expect(await rows()).toMatchObject([{ platform: "bsky", status: "posted" }]);
  });
});
