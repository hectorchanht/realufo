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
const POLL = JSON.stringify({ q: "Balloon or craft?", opts: ["Balloon", "Craft"] });

let sent: any[] = [];
let reads: string[] = [];
let tweet: () => Response;
let read: () => Response;
beforeEach(async () => {
  for (const t of ["poll_social", "poll_votes", "x_posts"]) await env.DB.prepare(`DELETE FROM ${t}`).run();
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
