// Pure request routing for the service worker (sw.js loads it with importScripts).
// Classic script, not an ES module: module service workers are patchy on older
// Safari/Firefox. Tested in web/src/tests/swRoute.test.ts against a fake `self`.
(function (self) {
  var CDN = "https://assets.realufo.org";
  var CACHES = ["ru-shell", "ru-assets", "ru-api", "ru-img"];
  // Reads that must always be live: Ask answers, file/upload streams, health.
  var API_SKIP = /^\/api\/(ask(\/|$)|asks\/|file\/|u\/|health$)/;

  // → "navigate" | "asset" | "api" | "img" | null (null = browser handles it, SW stays out)
  self.swRoute = function (href, method, mode, origin) {
    if (method !== "GET") return null;
    var u = new URL(href);
    if (mode === "navigate") return u.origin === origin ? "navigate" : null;
    if (u.origin === origin) {
      if (u.pathname.indexOf("/assets/") === 0) return "asset";
      if (u.pathname.indexOf("/api/") === 0 && !API_SKIP.test(u.pathname)) return "api";
      return null;
    }
    if (u.origin === CDN && /^\/(thumbs|cards)\//.test(u.pathname)) return "img";
    return null;
  };

  self.swOwnCache = function (name) {
    return CACHES.indexOf(name) !== -1;
  };

  // Vite build manifest (dist/asset-manifest.json) → every bundle file, deduped.
  // Legacy .woff skipped: every font also ships as .woff2, which all supported browsers use.
  self.swPrecache = function (manifest) {
    var out = {};
    Object.keys(manifest).forEach(function (k) {
      var e = manifest[k];
      [e.file].concat(e.css || [], e.assets || []).forEach(function (f) {
        if (f && !/\.woff$/.test(f)) out["/" + f] = true;
      });
    });
    return Object.keys(out);
  };
})(self);
