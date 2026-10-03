import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { seedTestDB } from "./helpers";
import { b64u } from "../lib/webpush";
import { pushNewFiles, pushDaily } from "../lib/push";

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

let hits: string[] = [];
beforeEach(async () => {
  for (const t of ["push_subs", "follows", "push_state", "x_posts"]) await env.DB.prepare(`DELETE FROM ${t}`).run();
  await env.DB.prepare("DELETE FROM records WHERE id LIKE 'PC-%'").run();
  hits = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any) => {
    hits.push(String(input));
    return new Response(null, { status: 201 });
  });
});
afterEach(() => vi.restoreAllMocks());

const sub = (name: string, cols: Record<string, number> = {}) =>
  env.DB.prepare("INSERT INTO push_subs(endpoint,actor_id,p256dh,auth,new_files,daily) VALUES(?,?,?,?,?,?)")
    .bind(`https://push.test/${name}`, name, ua.p256dh, ua.auth, cols.new_files ?? 0, cols.daily ?? 0)
    .run();
const record = (id: string, agency: string) =>
  env.DB.prepare("INSERT INTO records(id,archive,agency,title,status,created_at) VALUES(?,?,?,?, 'live', datetime('now','+1 minute'))")
    .bind(id, "wargov", agency, `Title ${id}`)
    .run();

describe("pushNewFiles", () => {
  it("first run only sets the watermark (no backlog flood)", async () => {
    await sub("all", { new_files: 1 });
    await pushNewFiles(E);
    expect(hits).toEqual([]);
    expect(await env.DB.prepare("SELECT v FROM push_state WHERE k='new_files'").first()).not.toBeNull();
  });

  it("digest to new_files subs and to followers of a matching hub, once", async () => {
    await sub("all", { new_files: 1 });
    await sub("fbi-fan");
    await sub("cia-fan");
    await sub("nobody");
    await env.DB.prepare("INSERT INTO follows(actor_id,kind,key,src) VALUES('fbi-fan','hub','agency/fbi','bell'),('cia-fan','hub','agency/cia','bell')").run();
    await pushNewFiles(E); // watermark
    await record("PC-1", "FBI");
    await pushNewFiles(E);
    expect(hits.sort()).toEqual(["https://push.test/all", "https://push.test/fbi-fan"]);
    hits = [];
    await pushNewFiles(E);
    expect(hits).toEqual([]);
  });

  it("the watermark never moves backwards (newest record hidden)", async () => {
    await env.DB.prepare("INSERT INTO push_state(k,v) VALUES('new_files','2999-01-01 00:00:00')").run();
    await pushNewFiles(E);
    expect(await env.DB.prepare("SELECT v FROM push_state WHERE k='new_files'").first("v")).toBe("2999-01-01 00:00:00");
  });

  it("topic hub followers match by the topic rule", async () => {
    await sub("bb-fan");
    await env.DB.prepare("INSERT INTO follows(actor_id,kind,key,src) VALUES('bb-fan','hub','topic/project-blue-book','bell')").run();
    await pushNewFiles(E);
    await env.DB.prepare("INSERT INTO records(id,archive,title,status,created_at) VALUES('PC-2','wargov','Project Blue Book case 1','live', datetime('now','+1 minute'))").run();
    await pushNewFiles(E);
    expect(hits).toEqual(["https://push.test/bb-fan"]);
  });
});

describe("pushDaily", () => {
  const xpost = (stream: string, ref: string, status: string) =>
    env.DB.prepare("INSERT INTO x_posts(stream,ref,text,ai,cost_usd,status,created_at) VALUES(?,?,?,0,0,?, datetime('now'))")
      .bind(stream, ref, `Look at ${ref} https://realufo.org/doc/${ref}`, status)
      .run();

  it("pushes the posted pick to daily subs, at most once a day", async () => {
    await sub("daily", { daily: 1 });
    await sub("nodaily");
    await xpost("pick", "CIA-UAP-017", "posted");
    await pushDaily(E);
    expect(hits).toEqual(["https://push.test/daily"]);
    await xpost("showcase", "CIA-UAP-018", "posted");
    await pushDaily(E);
    expect(hits).toHaveLength(1); // 20 h guard
  });

  it("ignores drafts, failed posts and release announcements", async () => {
    await sub("daily", { daily: 1 });
    await xpost("pick", "A", "draft");
    await xpost("pick", "B", "failed");
    await xpost("release", "6", "posted");
    await pushDaily(E);
    expect(hits).toEqual([]);
  });
});
