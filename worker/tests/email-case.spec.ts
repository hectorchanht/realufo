import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { seedTestDB } from "./helpers";
import { emailCaseOfWeek, isoWeekKey, pickCaseSlug, renderCaseNewsletter } from "../lib/emailCase";
import { CASE_SLUGS } from "../lib/caseStories";

let E: any;
beforeAll(async () => {
  await seedTestDB(env.DB);
  E = { ...env, RESEND_API_KEY: "test-key" };
});

let hits: { url: string; body: any }[] = [];
beforeEach(async () => {
  await env.DB.prepare("DELETE FROM email_subscribers").run();
  await env.DB.prepare("DELETE FROM push_state WHERE k LIKE 'email_case%'").run();
  hits = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init: any) => {
    hits.push({ url: String(input), body: JSON.parse(init?.body ?? "{}") });
    return new Response(JSON.stringify({ id: "x" }), { status: 200 });
  });
});
afterEach(() => vi.restoreAllMocks());

const FRIDAY = new Date("2026-10-09T12:00:00Z"); // Friday, ISO week 41
const SATURDAY = new Date("2026-10-10T12:00:00Z");

async function addSub(email: string, status = "confirmed") {
  await env.DB.prepare("INSERT INTO email_subscribers (email, status, token) VALUES (?, ?, ?)").bind(email, status, "tok-" + email).run();
}

describe("isoWeekKey", () => {
  it("labels known dates", () => {
    expect(isoWeekKey(FRIDAY)).toBe("2026-W41");
    expect(isoWeekKey(new Date("2026-10-10T12:00:00Z"))).toBe("2026-W41");
    expect(isoWeekKey(new Date("2026-10-12T12:00:00Z"))).toBe("2026-W42");
  });
});

describe("pickCaseSlug", () => {
  it("rotates through all stories and wraps", () => {
    expect(pickCaseSlug(0)).toBe(CASE_SLUGS[0]);
    expect(pickCaseSlug(CASE_SLUGS.length)).toBe(CASE_SLUGS[0]);
    expect(pickCaseSlug(CASE_SLUGS.length + 1)).toBe(CASE_SLUGS[1]);
  });
});

describe("emailCaseOfWeek", () => {
  it("sends only on Friday and only once per week", async () => {
    await addSub("a@example.com");
    const sat = await emailCaseOfWeek(E, SATURDAY);
    expect(sat.sent).toBe(false);
    expect(hits).toHaveLength(0);

    const fri = await emailCaseOfWeek(E, FRIDAY);
    expect(fri.sent).toBe(true);
    expect(fri.slug).toBe(CASE_SLUGS[0]);
    expect(fri.n).toBe(1);
    expect(hits).toHaveLength(1);
    expect(hits[0].url).toBe("https://api.resend.com/emails");
    expect(hits[0].body.to).toEqual(["a@example.com"]);
    expect(hits[0].body.subject).toContain("Case file:");
    expect(hits[0].body.html).toContain(`/case/${CASE_SLUGS[0]}`);
    expect(hits[0].body.html).toContain("unsubscribe?token=tok-a@example.com");

    const again = await emailCaseOfWeek(E, FRIDAY);
    expect(again.sent).toBe(false);
    expect(hits).toHaveLength(1);
  });

  it("advances the rotation counter across weeks", async () => {
    await addSub("a@example.com");
    await emailCaseOfWeek(E, FRIDAY);
    const nextFri = new Date("2026-10-16T12:00:00Z");
    const r2 = await emailCaseOfWeek(E, nextFri);
    expect(r2.sent).toBe(true);
    expect(r2.slug).toBe(CASE_SLUGS[1]);
  });

  it("skips pending subscribers and works with an empty list", async () => {
    await addSub("p@example.com", "pending");
    const r = await emailCaseOfWeek(E, FRIDAY);
    expect(r.sent).toBe(true);
    expect(r.n).toBe(0);
    expect(hits).toHaveLength(0);
  });

  it("is off without an API key", async () => {
    await addSub("a@example.com");
    const r = await emailCaseOfWeek({ ...E, RESEND_API_KEY: "" }, FRIDAY);
    expect(r.sent).toBe(false);
    expect(hits).toHaveLength(0);
  });

  it("renders every story without throwing", () => {
    for (const slug of CASE_SLUGS) {
      const html = renderCaseNewsletter(slug, "https://realufo.org/api/email/unsubscribe?token=x");
      expect(html).toContain(`/case/${slug}`);
      expect(html).toContain("READ THE FULL CASE FILE");
    }
  });
});
