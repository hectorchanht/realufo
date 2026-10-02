import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index";
import { seedTestDB } from "./helpers";

beforeAll(async () => {
  await seedTestDB(env.DB);
  await env.DB.prepare(
    "INSERT INTO records(id,archive,agency,title,kind,status) VALUES('SP ACE #1.pdf','aaro','AARO','Space id test','pdf','live')"
  ).run();
});
const call = (p: string) => worker.fetch(new Request("https://x" + p), env as any, {} as any);

describe("route params", () => {
  it("decodes percent-encoded ids", async () => {
    const res = await call("/api/records/" + encodeURIComponent("SP ACE #1.pdf"));
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).record.id).toBe("SP ACE #1.pdf");
  });
  it("malformed escape is a 404, not a 500", async () => {
    expect((await call("/api/records/50%-off")).status).toBe(404);
  });
});
