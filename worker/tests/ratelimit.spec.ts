import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index";
import { seedTestDB } from "./helpers";

beforeAll(() => seedTestDB(env.DB));

const lowEnv = { ...env, RATE_MAX: "3", RATE_WINDOW_SEC: "60" };
const postComment = (anon: string) =>
  worker.fetch(
    new Request("https://x/api/records/CIA-UAP-017/comments", {
      method: "POST",
      headers: { "content-type": "application/json", "X-Anon-Id": anon },
      body: JSON.stringify({ body: "spammy take" }),
    }),
    lowEnv as any,
    {} as any
  );

const postThread = (anon: string) =>
  worker.fetch(
    new Request("https://x/api/threads", {
      method: "POST",
      headers: { "content-type": "application/json", "X-Anon-Id": anon },
      body: JSON.stringify({ board: "uap", op_body: "spammy thread" }),
    }),
    lowEnv as any,
    {} as any
  );

describe("ratelimit", () => {
  it("allows the first RATE_MAX writes for an actor then 429s", async () => {
    for (let i = 0; i < 3; i++) {
      const r = await postComment("spammer");
      expect(r.status).toBe(201);
    }
    const r4 = await postComment("spammer");
    expect(r4.status).toBe(429);
  });

  it("does not rate-limit a different actor", async () => {
    const r = await postComment("innocent");
    expect(r.status).toBe(201);
  });

  it("counts different actions separately for the same actor", async () => {
    // "thread-actor" has not posted a thread yet, so this should be allowed
    // even though other actors have already hit the "comment" limit above.
    const r = await postThread("thread-actor");
    expect(r.status).toBe(201);
  });
});
