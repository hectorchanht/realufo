import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll, beforeEach, vi, afterEach } from "vitest";
import worker from "../index";
import { seedTestDB } from "./helpers";
import { actorId } from "../lib/anon";
import { b64u } from "../lib/webpush";
import { clip, notify, pushActivity } from "../lib/push";

let E: any;
let ua: { p256dh: string; auth: string };
beforeAll(async () => {
  await seedTestDB(env.DB);
  const k = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"])) as CryptoKeyPair;
  E = {
    ...env,
    FEATURE_PUSH: "on",
    VAPID_PUBLIC_KEY: b64u.enc((await crypto.subtle.exportKey("raw", k.publicKey)) as ArrayBuffer),
    VAPID_PRIVATE_KEY: ((await crypto.subtle.exportKey("jwk", k.privateKey)) as JsonWebKey).d,
  };
  const u = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  ua = { p256dh: b64u.enc((await crypto.subtle.exportKey("raw", u.publicKey)) as ArrayBuffer), auth: b64u.enc(crypto.getRandomValues(new Uint8Array(16))) };
});

const actor = (anon: string) => actorId(new Request("https://x", { headers: { "X-Anon-Id": anon } }), env.ANON_SALT);
let hits: string[] = [];
let status = 201;
beforeEach(async () => {
  for (const t of ["push_subs", "follows", "push_state"]) await env.DB.prepare(`DELETE FROM ${t}`).run();
  hits = [];
  status = 201;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any) => {
    hits.push(String(input));
    return new Response(null, { status });
  });
});
afterEach(() => vi.restoreAllMocks());

async function subscriber(anon: string, opts: { replies?: number } = {}) {
  const a = await actor(anon);
  await env.DB.prepare("INSERT INTO push_subs(endpoint,actor_id,p256dh,auth,replies) VALUES(?,?,?,?,?)")
    .bind(`https://push.test/${anon}`, a, ua.p256dh, ua.auth, opts.replies ?? 1)
    .run();
  return a;
}
const follow = (a: string, kind: string, key: string, src: "auto" | "bell") =>
  env.DB.prepare("INSERT INTO follows(actor_id,kind,key,src) VALUES(?,?,?,?)").bind(a, kind, key, src).run();

describe("pushActivity", () => {
  it("notifies bell followers and auto followers with replies on; never the author", async () => {
    const author = await subscriber("author");
    const bell = await subscriber("bell", { replies: 0 });
    const auto = await subscriber("auto");
    const muted = await subscriber("muted", { replies: 0 });
    for (const [a, src] of [[author, "auto"], [bell, "bell"], [auto, "auto"], [muted, "auto"]] as const) await follow(a, "thread", "t1", src);
    await pushActivity(E, "thread", "t1", author, "hello");
    expect(hits.sort()).toEqual(["https://push.test/auto", "https://push.test/bell"]);
  });

  it("author without an anon id: every follower is notified", async () => {
    const a = await subscriber("a1");
    await follow(a, "record", "CIA-UAP-017", "bell");
    await pushActivity(E, "record", "CIA-UAP-017", null, "x");
    expect(hits).toEqual(["https://push.test/a1"]);
  });

  it("throttles to one push per target per 10 minutes", async () => {
    const a = await subscriber("a2");
    await follow(a, "case", "kaikoura", "bell");
    await pushActivity(E, "case", "kaikoura", null, "1");
    await pushActivity(E, "case", "kaikoura", null, "2");
    expect(hits).toHaveLength(1);
    await env.DB.prepare("UPDATE push_state SET v=datetime('now','-11 minutes') WHERE k LIKE 'act:case:kaikoura:%'").run();
    await pushActivity(E, "case", "kaikoura", null, "3");
    expect(hits).toHaveLength(2);
  });

  it("author-only target: nothing sent, and the slot stays free for the next commenter", async () => {
    const a = await subscriber("solo");
    const b = await actor("other");
    await follow(a, "record", "CIA-UAP-017", "auto");
    await pushActivity(E, "record", "CIA-UAP-017", a, "mine");
    expect(hits).toEqual([]);
    await pushActivity(E, "record", "CIA-UAP-017", b, "theirs");
    expect(hits).toEqual(["https://push.test/solo"]);
  });

  it("back-and-forth: each side hears the other's first reply; repeats within 10 min are throttled", async () => {
    const a = await subscriber("ping");
    const b = await subscriber("pong");
    await follow(a, "thread", "t2", "auto");
    await follow(b, "thread", "t2", "auto");
    await pushActivity(E, "thread", "t2", b, "1");
    expect(hits).toEqual(["https://push.test/ping"]);
    await pushActivity(E, "thread", "t2", a, "2");
    expect(hits).toEqual(["https://push.test/ping", "https://push.test/pong"]);
    await pushActivity(E, "thread", "t2", b, "3");
    expect(hits).toHaveLength(2);
  });

  it("410 deletes the subscription; 5 failures in a row delete it too", async () => {
    const a = await subscriber("gone");
    await follow(a, "thread", "t2", "bell");
    status = 410;
    await pushActivity(E, "thread", "t2", null, "x");
    expect(await env.DB.prepare("SELECT 1 FROM push_subs WHERE actor_id=?").bind(a).first()).toBeNull();
    const b = await subscriber("flaky");
    await follow(b, "thread", "t3", "bell");
    status = 500;
    for (let i = 0; i < 5; i++) {
      await env.DB.prepare("DELETE FROM push_state").run();
      await pushActivity(E, "thread", "t3", null, "x");
    }
    expect(await env.DB.prepare("SELECT 1 FROM push_subs WHERE actor_id=?").bind(b).first()).toBeNull();
  });

  it("hitting the subrequest cap keeps fail_count and stops the fan-out", async () => {
    const subs = [];
    for (let i = 0; i < 25; i++) {
      await subscriber(`cap${i}`);
      subs.push({ endpoint: `https://push.test/cap${i}`, ...ua });
    }
    vi.mocked(fetch).mockImplementation(async (input: any) => {
      hits.push(String(input));
      throw new Error("Too many subrequests.");
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await notify(E, subs, { title: "t", body: "b", url: "/", tag: "x" })).toBe(0);
    expect(hits).toHaveLength(20); // first batch only
    expect(await env.DB.prepare("SELECT count(*) n FROM push_subs WHERE fail_count>0").first("n")).toBe(0);
  });

  it("does nothing while FEATURE_PUSH is off", async () => {
    const a = await subscriber("off");
    await follow(a, "thread", "t1", "bell");
    await pushActivity({ ...E, FEATURE_PUSH: "off" }, "thread", "t1", null, "x");
    expect(hits).toEqual([]);
  });

  it("a reply through the API pushes the thread's other followers", async () => {
    const a = await subscriber("watcher");
    await follow(a, "thread", "t1", "bell");
    const res = await worker.fetch(
      new Request("https://x/api/threads/t1/posts", { method: "POST", headers: { "X-Anon-Id": "replier" }, body: JSON.stringify({ body: "new reply" }) }),
      E,
      {} as any,
    );
    expect(res.status).toBe(201);
    expect(hits).toContain("https://push.test/watcher");
  });
});

describe("clip", () => {
  it("keeps payload text short", () => {
    expect(clip("short", 10)).toBe("short");
    expect(clip("a".repeat(150), 100)).toHaveLength(100);
    expect(clip("a".repeat(150), 100).endsWith("…")).toBe(true);
  });
});
