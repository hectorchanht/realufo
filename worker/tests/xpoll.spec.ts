import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { seedTestDB } from "./helpers";
import { pollTick } from "../lib/xpoll";
import { sqlTime } from "../lib/xpick";

beforeAll(() => seedTestDB(env.DB));

const NOW = new Date("2026-10-10T15:00:00Z");
const SECRETS = { X_API_KEY: "k", X_API_SECRET: "s", X_ACCESS_TOKEN: "t", X_ACCESS_SECRET: "ts" };
const E = (extra: Record<string, unknown> = {}) =>
  ({ ...env, ...SECRETS, FEATURE_X: "on", X_POLLS: "on", X_MONTHLY_USD_CAP: "10", ...extra }) as any;
const noSleep = async () => {};
const POLL = JSON.stringify({ q: "Balloon or craft?", opts: ["Balloon", "Craft"] });

let sent: any[] = [];
let reads: string[] = [];
let tweet: () => Response;
let read: () => Response;
beforeEach(async () => {
  for (const t of ["poll_social", "poll_votes", "social_posts", "x_posts"]) await env.DB.prepare(`DELETE FROM ${t}`).run();
  await env.DB.prepare("DELETE FROM threads WHERE id LIKE 'ar_xp%'").run();
  await env.DB.prepare("DELETE FROM articles WHERE slug LIKE 'xp%'").run();
  // story xp1: poll + posted showcase head tweet H1 (thread source record = the showcase record)
  await env.DB.prepare("INSERT INTO articles(slug,title,body,poll,thread_id) VALUES ('xp1','T','B',?,'ar_xp1')").bind(POLL).run();
  await env.DB.prepare(
    "INSERT INTO threads(id,no,board_id,title,stance,op_body,tags,votes,reply_count,img_count,source_record_id,hot,created_at) VALUES ('ar_xp1',1,'uap','T','analyst','B','[]',0,0,0,'CIA-UAP-017',0,?)"
  ).bind(sqlTime(NOW)).run();
  await env.DB.prepare("INSERT INTO x_posts(stream,ref,text,ai,cost_usd,status,tweet_id,created_at) VALUES ('showcase','CIA-UAP-017','t',0,0.2,'posted','H1',?)")
    .bind(sqlTime(NOW)).run();
  sent = []; reads = [];
  tweet = () => new Response(JSON.stringify({ data: { id: "P1" } }), { status: 201 });
  read = () => new Response(JSON.stringify({ data: { id: "P1" }, includes: { polls: [{ voting_status: "open", options: [{ position: 1, votes: 7 }, { position: 2, votes: 3 }] }] } }));
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init: any = {}) => {
    const u = String(input);
    if (u.startsWith("https://api.telegram.org/")) return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }));
    if (u.endsWith("/2/tweets") && init.method === "POST") { sent.push(JSON.parse(init.body)); return tweet(); }
    if (u.includes("/2/tweets/")) { reads.push(u); return read(); }
    throw new Error("unexpected fetch " + u);
  });
});
afterEach(() => vi.restoreAllMocks());

const row = (slug = "xp1") => env.DB.prepare("SELECT * FROM poll_social WHERE slug=? AND platform='x'").bind(slug).first<any>();

describe("pollTick", () => {
  it("off unless FEATURE_X=on and X_POLLS=on", async () => {
    await pollTick(E({ X_POLLS: "" }), NOW);
    await pollTick(E({ FEATURE_X: "dry" }), NOW);
    expect(sent).toEqual([]);
    expect(await row()).toBeNull();
  });

  it("spacing: extra ticks (publish.sh's manual /__tick) can't post the next story's poll within 2.5 h", async () => {
    await env.DB.prepare("INSERT INTO articles(slug,title,body,poll,thread_id,created_at) VALUES ('xp2','T','B',?,'ar_xp2','2099-01-01 00:00:00')").bind(POLL).run();
    await env.DB.prepare(
      "INSERT INTO threads(id,no,board_id,title,stance,op_body,tags,votes,reply_count,img_count,source_record_id,hot,created_at) VALUES ('ar_xp2',2,'uap','T','analyst','B','[]',0,0,0,'CIA-UAP-017',0,?)"
    ).bind(sqlTime(NOW)).run();
    await pollTick(E(), NOW);
    await pollTick(E(), new Date(NOW.getTime() + 60_000)); // a manual tick a minute later
    await pollTick(E(), new Date(NOW.getTime() + 2 * 3600_000));
    expect(sent).toHaveLength(1);
    expect(await row("xp2")).toBeNull();
    await pollTick(E(), new Date(NOW.getTime() + 3 * 3600_000 - 30_000)); // next cron, a few seconds early
    expect(sent).toHaveLength(2);
    expect(await row("xp2")).toMatchObject({ status: "posted" });
  });

  it("a failed poll doesn't hold back the next one", async () => {
    await env.DB.prepare("INSERT INTO articles(slug,title,body,poll,thread_id,created_at) VALUES ('xp2','T','B',?,'ar_xp2','2099-01-01 00:00:00')").bind(POLL).run();
    await env.DB.prepare(
      "INSERT INTO threads(id,no,board_id,title,stance,op_body,tags,votes,reply_count,img_count,source_record_id,hot,created_at) VALUES ('ar_xp2',2,'uap','T','analyst','B','[]',0,0,0,'CIA-UAP-017',0,?)"
    ).bind(sqlTime(NOW)).run();
    tweet = () => new Response(JSON.stringify({ title: "Invalid Request" }), { status: 400 });
    await pollTick(E(), NOW);
    tweet = () => new Response(JSON.stringify({ data: { id: "P9" } }), { status: 201 });
    await pollTick(E(), new Date(NOW.getTime() + 60_000));
    expect(await row("xp2")).toMatchObject({ status: "posted" });
  });

  it("posts the poll once, as a reply to the head tweet, no media, no link", async () => {
    await pollTick(E(), NOW);
    expect(sent).toEqual([{ text: "Balloon or craft? 👇", reply: { in_reply_to_tweet_id: "H1" }, poll: { options: ["Balloon", "Craft"], duration_minutes: 4320 } }]);
    expect(await row()).toMatchObject({ status: "posted", remote_id: "P1", cost_usd: 0.015, closes_at: "2026-10-13 15:00:00", fetched_at: sqlTime(NOW) });
    await pollTick(E(), NOW);
    expect(sent).toHaveLength(1);
  });

  it("skips stories without a posted showcase (and without a poll)", async () => {
    await env.DB.prepare("UPDATE x_posts SET status='failed'").run();
    await pollTick(E(), NOW);
    await env.DB.prepare("UPDATE x_posts SET status='posted'").run();
    await env.DB.prepare("UPDATE articles SET poll=NULL WHERE slug='xp1'").run();
    await pollTick(E(), NOW);
    expect(sent).toEqual([]);
  });

  it("network error leaves pending, next tick does not repost", async () => {
    tweet = () => { throw new TypeError("network connection lost"); };
    await pollTick(E(), NOW);
    expect(await row()).toMatchObject({ status: "pending" });
    tweet = () => new Response(JSON.stringify({ data: { id: "P2" } }), { status: 201 });
    await pollTick(E(), NOW);
    expect(sent).toHaveLength(1);
  });

  it("402 (out of credits) deletes the row so a later tick retries", async () => {
    tweet = () => new Response(JSON.stringify({ title: "CreditsDepleted" }), { status: 402 });
    await pollTick(E(), NOW);
    expect(await row()).toBeNull();
  });

  it("429 (rate limited: nothing posted) deletes the row so a later tick retries", async () => {
    tweet = () => new Response(JSON.stringify({ title: "Too Many Requests" }), { status: 429 });
    await pollTick(E(), NOW);
    expect(await row()).toBeNull();
  });

  it("an older story with an unparsable poll doesn't block the next one", async () => {
    await env.DB.prepare("INSERT INTO articles(slug,title,body,poll,thread_id,created_at) VALUES ('xp0','T','B','{broken','ar_xp0','2000-01-01 00:00:00')").run();
    await env.DB.prepare(
      "INSERT INTO threads(id,no,board_id,title,stance,op_body,tags,votes,reply_count,img_count,source_record_id,hot,created_at) VALUES ('ar_xp0',2,'uap','T','analyst','B','[]',0,0,0,'CIA-UAP-017',0,?)"
    ).bind(sqlTime(NOW)).run();
    await pollTick(E(), NOW);
    expect(sent).toHaveLength(1);
    expect(await row()).toMatchObject({ status: "posted" });
    expect(await row("xp0")).toBeNull();
  });

  it("other X errors mark the row failed", async () => {
    tweet = () => new Response(JSON.stringify({ title: "Invalid Request" }), { status: 400 });
    await pollTick(E(), NOW);
    expect(await row()).toMatchObject({ status: "failed" });
  });

  it("respects the monthly $ cap", async () => {
    await pollTick(E({ X_MONTHLY_USD_CAP: "0.2" }), NOW); // the head tweet already cost 0.2
    expect(sent).toEqual([]);
  });

  it("refreshes an open poll at most every 20 h, then reads it once more after close and marks it closed", async () => {
    await pollTick(E(), NOW); // posts; fetched_at = NOW
    await pollTick(E(), new Date(NOW.getTime() + 19 * 3600_000));
    expect(reads).toEqual([]);
    await pollTick(E(), new Date(NOW.getTime() + 21 * 3600_000));
    expect(reads).toHaveLength(1);
    expect(await row()).toMatchObject({ status: "posted", counts: "[7,3]", total: 10 });
    read = () => new Response(JSON.stringify({ data: { id: "P1" }, includes: { polls: [{ voting_status: "closed", options: [{ position: 1, votes: 9 }, { position: 2, votes: 4 }] }] } }));
    await pollTick(E(), new Date(NOW.getTime() + 73 * 3600_000)); // past closes_at
    expect(await row()).toMatchObject({ status: "closed", counts: "[9,4]", total: 13 });
    await pollTick(E(), new Date(NOW.getTime() + 100 * 3600_000));
    expect(reads).toHaveLength(2); // closed = never read again
  });

  it("missing poll in response marks failed (not re-read every tick)", async () => {
    await pollTick(E(), NOW);
    read = () => new Response(JSON.stringify({ data: { id: "P1" } }));
    await pollTick(E(), new Date(NOW.getTime() + 21 * 3600_000));
    expect(await row()).toMatchObject({ status: "failed", error: "no poll in response" });
  });
});

describe("pollTick: threads (standalone poll post — the app can't reply)", () => {
  const TE = (x: Record<string, unknown> = {}) => E({ THREADS_USER_ID: "TU", FEATURE_SOCIAL_THREADS: "on", ...x });
  const trow = () => env.DB.prepare("SELECT * FROM poll_social WHERE slug='xp1' AND platform='threads'").first<any>();
  let creates: URLSearchParams[] = [];
  let create: () => Response;
  let tRead: () => Response;
  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM social_posts").run();
    await env.DB.prepare("DELETE FROM social_auth").run();
    await env.DB.prepare("INSERT INTO social_auth(platform,access_token,expires_at) VALUES ('threads','TH','2099-01-01 00:00:00')").run();
    // the story is mirrored on Threads (posted) — the poll follows it
    await env.DB.prepare(
      "INSERT INTO social_posts(x_post_id,platform,status,remote_id) SELECT id,'threads','posted','TH1' FROM x_posts WHERE ref='CIA-UAP-017'"
    ).run();
    creates = [];
    create = () => Response.json({ id: "C1" });
    tRead = () => Response.json({ poll_attachment: { option_a_votes_percentage: 0.7, option_b_votes_percentage: 0.3, total_votes: 10, expiration_timestamp: "2026-10-11T15:00:00+0000" } });
    const base = vi.mocked(globalThis.fetch).getMockImplementation()!;
    vi.mocked(globalThis.fetch).mockImplementation(async (input: any, init: any = {}) => {
      const u = String(input);
      if (!u.startsWith("https://graph.threads.net/")) return base(input, init);
      if (u.endsWith("/TU/threads")) { creates.push(new URLSearchParams(init.body)); return create(); }
      if (u.includes("/C1?")) return Response.json({ status: "FINISHED" });
      if (u.endsWith("/TU/threads_publish")) return Response.json({ id: "TP1" });
      if (u.includes("/TP1?")) return tRead();
      throw new Error("unexpected threads fetch " + u);
    });
  });

  it("posts a standalone TEXT poll (no reply_to_id) with the story link, once", async () => {
    await pollTick(TE(), NOW, noSleep);
    expect(creates).toHaveLength(1);
    expect(Object.fromEntries(creates[0])).toMatchObject({
      media_type: "TEXT",
      text: "Balloon or craft? 👇\nFull story: https://realufo.org/thread/ar_xp1",
      access_token: "TH",
    });
    expect(JSON.parse(creates[0].get("poll_attachment")!)).toEqual({ option_a: "Balloon", option_b: "Craft" });
    expect(creates[0].has("reply_to_id")).toBe(false);
    expect(await trow()).toMatchObject({ status: "posted", remote_id: "TP1", fetched_at: sqlTime(NOW) });
    await pollTick(TE(), NOW, noSleep);
    expect(creates).toHaveLength(1);
  });

  it("spacing: a second Threads poll waits 2.5 h after the last one", async () => {
    await env.DB.prepare("INSERT INTO articles(slug,title,body,poll,thread_id,created_at) VALUES ('xp2','T','B',?,'ar_xp2','2099-01-01 00:00:00')").bind(POLL).run();
    await env.DB.prepare(
      "INSERT INTO threads(id,no,board_id,title,stance,op_body,tags,votes,reply_count,img_count,source_record_id,hot,created_at) VALUES ('ar_xp2',2,'uap','T','analyst','B','[]',0,0,0,'CIA-UAP-017',0,?)"
    ).bind(sqlTime(NOW)).run();
    await pollTick(TE(), NOW, noSleep);
    await pollTick(TE(), new Date(NOW.getTime() + 60_000), noSleep);
    expect(creates).toHaveLength(1);
    await pollTick(TE(), new Date(NOW.getTime() + 3 * 3600_000 - 30_000), noSleep);
    expect(creates).toHaveLength(2);
  });

  it("off without Threads configured/on, or before the story is on Threads", async () => {
    await pollTick(TE({ FEATURE_SOCIAL_THREADS: "dry" }), NOW, noSleep);
    await pollTick(TE({ THREADS_USER_ID: "" }), NOW, noSleep);
    await env.DB.prepare("UPDATE social_posts SET status='pending'").run();
    await pollTick(TE(), NOW, noSleep);
    expect(creates).toEqual([]);
    expect(await trow()).toBeNull();
  });

  it("refresh turns the 0-1 fractions into counts; past expiry = closed", async () => {
    await pollTick(TE(), NOW, noSleep);
    await pollTick(TE(), new Date(NOW.getTime() + 21 * 3600_000), noSleep);
    expect(await trow()).toMatchObject({ status: "posted", counts: "[7,3]", total: 10, closes_at: "2026-10-11 15:00:00" });
    await pollTick(TE(), new Date(NOW.getTime() + 25 * 3600_000), noSleep);
    expect(await trow()).toMatchObject({ status: "closed" });
  });

  it("429 drops the row (retry next tick); other API errors mark it failed", async () => {
    create = () => new Response('{"error":{"message":"rate"}}', { status: 429 });
    await pollTick(TE(), NOW, noSleep);
    expect(await trow()).toBeNull();
    create = () => new Response('{"error":{"message":"Application does not have permission","code":10}}', { status: 400 });
    await pollTick(TE(), NOW, noSleep);
    expect(await trow()).toMatchObject({ status: "failed" });
  });
});

describe("gate (FEATURE_GATE=on)", () => {
  const G = (extra: Record<string, unknown> = {}) => E({ FEATURE_GATE: "on", TELEGRAM_BOT_TOKEN: "T0K", TELEGRAM_OWNER_ID: "777", ...extra });
  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM bot_job_versions").run();
    await env.DB.prepare("DELETE FROM bot_jobs").run();
  });
  it("no poll is posted without an approved job; a poll job + preview is queued instead", async () => {
    const before = sent.length;
    await pollTick(G(), NOW, noSleep);
    expect(sent.length).toBe(before); // nothing sent to X
    const j = await env.DB.prepare("SELECT kind, stream, ref, status FROM bot_jobs").all<any>();
    expect(j.results).toEqual([{ kind: "poll", stream: "poll", ref: "xp1", status: "post_wait" }]);
  });
  it("an approved article or poll job lets the poll post", async () => {
    await env.DB.prepare("INSERT INTO bot_jobs(kind,stream,ref,status,payload) VALUES ('article','article','xp1','posted','{}')").run();
    await pollTick(G(), NOW, noSleep);
    const r = await env.DB.prepare("SELECT status FROM poll_social WHERE slug='xp1' AND platform='x'").first<any>();
    expect(r?.status).toBe("posted");
  });
});
