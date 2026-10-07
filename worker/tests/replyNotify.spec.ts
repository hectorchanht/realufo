// Reply notifications via email: quote parsing, email validation,
// subscription on thread/reply create, quoted-post notification fan-out,
// and one-click unsubscribe.
import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import worker from "../index";
import { seedTestDB } from "./helpers";
import { parseQuoteNos, validNotifyEmail, notifyQuoted } from "../lib/replyNotify";

beforeAll(() => seedTestDB(env.DB));
const call = (p: string, init?: RequestInit) => worker.fetch(new Request("https://x" + p, init), env as any, {} as any);

async function firstBoard(): Promise<string> {
  const r = await env.DB.prepare("SELECT id FROM boards LIMIT 1").first<{ id: string }>();
  if (!r) throw new Error("no boards seeded");
  return r.id;
}

describe("parseQuoteNos", () => {
  it("extracts distinct nos in order", () => {
    expect(parseQuoteNos(">>24420082 hello\n>>24420083 world >>24420082")).toEqual([24420082, 24420083]);
  });
  it("returns [] when nothing is quoted", () => {
    expect(parseQuoteNos("no quotes here")).toEqual([]);
  });
  it("caps at 10 quotes", () => {
    const body = Array.from({ length: 15 }, (_, i) => `>>${24420000 + i}`).join(" ");
    expect(parseQuoteNos(body)).toHaveLength(10);
  });
});

describe("validNotifyEmail", () => {
  it("accepts and normalizes", () => {
    expect(validNotifyEmail("  Foo@Example.COM ")).toBe("foo@example.com");
  });
  it("rejects garbage", () => {
    expect(validNotifyEmail("not-an-email")).toBeNull();
    expect(validNotifyEmail("")).toBeNull();
    expect(validNotifyEmail(undefined)).toBeNull();
  });
});

describe("reply subscriptions on create", () => {
  it("creating a thread with notify_email subscribes the OP post", async () => {
    const board = await firstBoard();
    const r = await call("/api/threads", {
      method: "POST",
      headers: { "X-Anon-Id": "rn-op" },
      body: JSON.stringify({ board, title: "rn thread", op_body: "op text", notify_email: "op@example.com" }),
    });
    expect(r.status).toBe(201);
    const j: any = await r.json();
    const sub = await env.DB.prepare("SELECT email, token FROM reply_subs WHERE post_id=?")
      .bind(j.thread.op_id)
      .first<{ email: string; token: string }>();
    expect(sub?.email).toBe("op@example.com");
    expect(sub?.token).toMatch(/^[0-9a-f]{32}$/);
  });

  it("an invalid notify_email subscribes nothing", async () => {
    const board = await firstBoard();
    const r = await call("/api/threads", {
      method: "POST",
      headers: { "X-Anon-Id": "rn-op2" },
      body: JSON.stringify({ board, title: "rn thread 2", op_body: "op text", notify_email: "bogus" }),
    });
    expect(r.status).toBe(201);
    const j: any = await r.json();
    const sub = await env.DB.prepare("SELECT 1 FROM reply_subs WHERE post_id=?").bind(j.thread.op_id).first();
    expect(sub).toBeNull();
  });

  it("replying with notify_email subscribes the reply post", async () => {
    const board = await firstBoard();
    const t: any = await (
      await call("/api/threads", {
        method: "POST",
        headers: { "X-Anon-Id": "rn-opa" },
        body: JSON.stringify({ board, title: "rn thread 3", op_body: "op text" }),
      })
    ).json();
    const r = await call(`/api/threads/${t.thread.id}/posts`, {
      method: "POST",
      headers: { "X-Anon-Id": "rn-replier" },
      body: JSON.stringify({ body: "a reply", notify_email: "replier@example.com" }),
    });
    expect(r.status).toBe(201);
    const j: any = await r.json();
    const sub = await env.DB.prepare("SELECT email FROM reply_subs WHERE post_id=?")
      .bind(j.post.id)
      .first<{ email: string }>();
    expect(sub?.email).toBe("replier@example.com");
  });
});

describe("notifyQuoted", () => {
  const tid = "ut_rn1";
  const sent: { url: string; body: any }[] = [];
  const realFetch = globalThis.fetch;
  const stubFetch = () =>
    (globalThis.fetch = (async (url: any, init: any) => {
      sent.push({ url: String(url), body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ id: "mocked" }), { status: 200 });
    }) as any);

  beforeAll(async () => {
    const board = await firstBoard();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO threads(id,no,board_id,title,stance,op_body,op_id,tags,votes,reply_count,img_count,hot,created_at) VALUES(?,?,?,?,?,?,?, '[]',0,0,0,0,datetime('now'))",
      ).bind(tid, 24420101, board, "rn title", "neutral", "op body", "rnop1"),
      env.DB.prepare(
        "INSERT INTO posts(id,no,thread_id,body,stance,votes,is_op,created_at,actor_id) VALUES(?,?,?,?,?,?,1,datetime('now'),?)",
      ).bind("rnop1", 24420101, tid, "op body", "neutral", 0, "actorA"),
      env.DB.prepare("INSERT INTO reply_subs(id,post_id,email,token) VALUES(?,?,?,?)").bind(
        "rns1",
        "rnop1",
        "watcher@example.com",
        "tokrn123",
      ),
    ]);
    stubFetch();
  });

  afterEach(() => {
    sent.length = 0;
    stubFetch();
  });

  // vitest runs afterEach after the last test too; restore the real fetch
  // for any suite that runs after this file in the same worker.
  afterAll(() => {
    globalThis.fetch = realFetch;
  });

  const testEnv = () => ({ ...env, RESEND_API_KEY: "test-key" }) as any;

  it("emails the subscriber with snippet, deep link and unsubscribe", async () => {
    await notifyQuoted(testEnv(), tid, "rn title", {
      no: 24420102,
      body: ">>24420101 I disagree because reasons",
      actor_id: "actorB",
      notifyEmail: null,
    });
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe("https://api.resend.com/emails");
    expect(sent[0].body.to).toEqual(["watcher@example.com"]);
    expect(sent[0].body.subject).toContain("replied");
    expect(sent[0].body.html).toContain("I disagree because reasons");
    expect(sent[0].body.html).toContain(`/thread/${tid}#p24420102`);
    expect(sent[0].body.html).toContain("token=tokrn123");
  });

  it("skips quoting your own post from the same browser", async () => {
    await notifyQuoted(testEnv(), tid, "rn title", {
      no: 24420103,
      body: ">>24420101 self quote",
      actor_id: "actorA",
      notifyEmail: null,
    });
    expect(sent).toHaveLength(0);
  });

  it("skips the replier's own subscription email", async () => {
    await notifyQuoted(testEnv(), tid, "rn title", {
      no: 24420104,
      body: ">>24420101 replying",
      actor_id: "actorC",
      notifyEmail: "watcher@example.com",
    });
    expect(sent).toHaveLength(0);
  });

  it("sends nothing when nothing is quoted", async () => {
    await notifyQuoted(testEnv(), tid, "rn title", {
      no: 24420105,
      body: "no quotes here",
      actor_id: "actorC",
      notifyEmail: null,
    });
    expect(sent).toHaveLength(0);
  });

  it("unsubscribes via the token link", async () => {
    const r = await call("/api/email/unsubscribe?token=tokrn123");
    expect(r.status).toBe(200);
    const sub = await env.DB.prepare("SELECT 1 FROM reply_subs WHERE token=?").bind("tokrn123").first();
    expect(sub).toBeNull();
  });
});
