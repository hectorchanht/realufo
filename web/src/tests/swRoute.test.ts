// sw-route.js is a classic script for the service worker; evaluate it against a fake `self`.
import src from "../../public/sw-route.js?raw";
import { describe, it, expect } from "vitest";

const self: Record<string, any> = {};
new Function("self", src)(self);
const O = "https://realufo.org";
const route = (href: string, method = "GET", mode = "cors") => self.swRoute(href, method, mode, O);

describe("swRoute", () => {
  it("navigations: same-origin only", () => {
    expect(route(`${O}/doc/X`, "GET", "navigate")).toBe("navigate");
    expect(route("https://example.com/", "GET", "navigate")).toBeNull();
    expect(route(`${O}/doc/X/text`, "GET", "navigate")).toBe("navigate");
    expect(route(`${O}/case/kaikoura`, "GET", "navigate")).toBe("navigate");
  });
  it("navigations to files/feeds are not pages", () => {
    for (const p of ["/api/file/X", "/api/u/a.jpg", "/rss.xml", "/sitemap.xml", "/llms.txt", "/llms-full.txt", "/robots.txt", "/__tick"])
      expect(route(O + p, "GET", "navigate")).toBeNull();
  });
  it("hashed bundles cache-first", () => {
    expect(route(`${O}/assets/index-abc.js`)).toBe("asset");
  });
  it("API reads network-first, minus the never-cache list", () => {
    expect(route(`${O}/api/records/DOW-UAP-D006`)).toBe("api");
    expect(route(`${O}/api/feed`)).toBe("api");
    for (const p of ["/api/ask?q=x", "/api/ask/recent", "/api/asks/12", "/api/file/X", "/api/u/a.jpg", "/api/health"])
      expect(route(O + p)).toBeNull();
  });
  it("never touches writes", () => {
    expect(route(`${O}/api/votes`, "POST")).toBeNull();
    expect(route(`${O}/assets/a.js`, "POST")).toBeNull();
  });
  it("CDN thumbnails and share cards only", () => {
    expect(route("https://assets.realufo.org/thumbs/wargov/X.jpg", "GET", "no-cors")).toBe("img");
    expect(route("https://assets.realufo.org/cards/X-r2.png", "GET", "no-cors")).toBe("img");
    expect(route("https://assets.realufo.org/files/wargov/X.pdf")).toBeNull();
    expect(route("https://assets.realufo.org/clips/wargov/X.mp4")).toBeNull();
  });
  it("other same-origin files pass through", () => {
    expect(route(`${O}/sw.js`)).toBeNull();
    expect(route(`${O}/rss.xml`)).toBeNull();
  });
  it("owns only its four caches (old Astro caches get deleted)", () => {
    for (const c of ["ru-shell", "ru-assets", "ru-api", "ru-img"]) expect(self.swOwnCache(c)).toBe(true);
    expect(self.swOwnCache("astro-pages-v3")).toBe(false);
    expect(self.swOwnCache("workbox-precache")).toBe(false);
  });
  it("precache list from the Vite manifest, no legacy .woff", () => {
    const list = self.swPrecache({
      "index.html": { file: "assets/index-a.js", css: ["assets/index-b.css"], assets: ["assets/f-c.woff2", "assets/f-c.woff"] },
      "src/screens/Doc.tsx": { file: "assets/Doc-d.js" },
      "_shared": { file: "assets/index-a.js" },
    });
    expect(list.sort()).toEqual(["/assets/Doc-d.js", "/assets/f-c.woff2", "/assets/index-a.js", "/assets/index-b.css"]);
  });
});
