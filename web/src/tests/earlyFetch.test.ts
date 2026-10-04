// Runs the real early-fetch <script> from index.html against fake globals and checks
// it requests exactly the paths the hooks will (spec 2026-10-04-realufo-early-fetch).
import { describe, it, expect } from "vitest";
import html from "../../index.html?raw";
import { recordsPath } from "../api/queries";
import { RECORDS_PAGE_SIZE } from "../lib/recordsPage";

const src = html.match(/<script>([^<]*__early[^<]*)<\/script>/)?.[1] ?? "";

function run(url: string, anon: string | null | "throws" = "anon-1") {
  const u = new URL(url, "https://realufo.org");
  const calls: { path: string; headers: Record<string, string> }[] = [];
  const win: { __early?: Record<string, unknown> } = {};
  const fetch = (path: string, init: { headers: Record<string, string> }) => {
    calls.push({ path, headers: init.headers });
    return Promise.resolve(new Response("{}", { status: 200 }));
  };
  const localStorage = {
    getItem: () => {
      if (anon === "throws") throw new Error("SecurityError");
      return anon;
    },
  };
  new Function("window", "location", "fetch", "localStorage", "performance", src)(
    win, { pathname: u.pathname, search: u.search }, fetch, localStorage, { now: () => 5 },
  );
  return { paths: calls.map((c) => c.path), calls, early: win.__early ?? {} };
}

const LIST = recordsPath({ limit: RECORDS_PAGE_SIZE, offset: 0 });
const BASE = ["/api/bootstrap", "/api/hubs"];

describe("index.html early fetch", () => {
  it("is present in index.html", () => {
    expect(src).toContain("__early");
  });

  it("home: bootstrap, hubs, feed", () => {
    expect(run("/").paths).toEqual([...BASE, "/api/feed"]);
  });

  it("doc landing: record, comments and the default neighbour list", () => {
    expect(run("/doc/DOW-UAP-PR067").paths).toEqual([
      ...BASE, "/api/records/DOW-UAP-PR067", "/api/records/DOW-UAP-PR067/comments", LIST,
    ]);
  });

  it("doc id is decoded like useParams (encoded characters)", () => {
    expect(run("/doc/A%20B").paths).toContain("/api/records/A B");
  });

  it("doc or archive with a query string: no list guess", () => {
    expect(run("/doc/X?q=balloon&page=2").paths).toEqual([...BASE, "/api/records/X", "/api/records/X/comments"]);
    expect(run("/archive?q=washington").paths).toEqual(BASE);
  });

  it("bare archive: facets and the first page", () => {
    expect(run("/archive").paths).toEqual([...BASE, "/api/records/facets", LIST]);
  });

  it("other routes: only bootstrap and hubs", () => {
    expect(run("/boards").paths).toEqual(BASE);
    expect(run("/doc/X/text").paths).toEqual(BASE);
  });

  it("sends X-Anon-Id only when one is stored, and survives localStorage throwing", () => {
    expect(run("/", "anon-1").calls[0].headers).toEqual({ "X-Anon-Id": "anon-1" });
    expect(run("/", null).calls[0].headers).toEqual({});
    expect(run("/", "throws").paths).toEqual([...BASE, "/api/feed"]);
  });

  it("stores {at, p} per path; p resolves to {d, stale}", async () => {
    const { early } = run("/");
    const e = early["/api/feed"] as { at: number; p: Promise<unknown> };
    expect(e.at).toBe(5);
    await expect(e.p).resolves.toEqual({ d: {}, stale: false });
  });
});
