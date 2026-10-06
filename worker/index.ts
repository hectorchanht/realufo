import type { Env } from "./env";
import { CASE_STORY_TEXT } from "./lib/caseStoryText";
import { on, dispatch } from "./router";
import { sameSecret } from "./lib/secret";
import { error, json } from "./lib/json";
import { health } from "./routes/health";
import { bootstrap } from "./routes/bootstrap";
import { feed } from "./routes/feed";
import { shorts, likeShort } from "./routes/shorts";
import { listRecords, getRecord, recordFacets } from "./routes/records";
import { timeline } from "./routes/timeline";
import { viewFile } from "./routes/file";
import { viewUpload } from "./routes/upload";
import { listComments, addComment, listCaseComments, addCaseComment } from "./routes/comments";
import { boardThreads } from "./routes/boards";
import { getThread, createThread, searchThreads } from "./routes/threads";
import { createPost } from "./routes/posts";
import { toggleVote } from "./routes/votes";
import { castVerdict } from "./routes/verdicts";
import { getPoll, castPoll } from "./routes/polls";
import { getCase } from "./routes/cases";
import { serveWithMeta } from "./lib/meta";
import { ask, recentAsks, setAskPublic, getSharedAsk } from "./routes/ask";
import { sitemap } from "./routes/sitemap";
import { rss } from "./routes/rss";
import { llms, llmsFull } from "./routes/llms";
import { recordText } from "./routes/text";
import { hubsIndex, getHub } from "./routes/hubs";
import { releasesApi } from "./routes/releases";
import { tgWebhook } from "./routes/tg";
import { jobRoute } from "./routes/job";
import { gateOn, queue, sweepStuck } from "./lib/gate";
import { contentTick } from "./lib/contentTick";
import { stage, tick } from "./lib/xbot";
import { nextCandidate } from "./lib/xpick";
import { tick as socialTick } from "./lib/social/tick";
import { pollTick } from "./lib/xpoll";
import { pushNewFiles, pushDaily } from "./lib/push";
import { pushConfig, subscribe, setPrefs, unsubscribe, pushMe, getFollow, toggleFollow, mergeFollows } from "./routes/push";
import { emailNewFiles } from "./lib/email";
import { emailSubscribe, emailConfirm, emailUnsubscribe } from "./routes/email";
import { v1ListRecords, v1GetRecord, v1RecordText, v1Archives, v1Releases, v1Cases, v1GetCase, v1Shorts, v1Hubs, v1GetHub, v1Usage, v1OpenAPI, v1Preflight } from "./routes/v1";
import { createWebhookRoute, getWebhookRoute, deleteWebhookRoute } from "./routes/webhooks";
import { webhookTick } from "./lib/webhooks";
import { badge, card } from "./routes/embed";
import { hashAssets, hashBackfillTick } from "./routes/hashbackfill";

on("GET", "/api/health", health);
on("GET", "/api/bootstrap", bootstrap);
on("GET", "/api/feed", feed);
on("GET", "/api/shorts", shorts);
on("GET", "/api/ask", ask);
on("GET", "/api/ask/recent", recentAsks);
on("POST", "/api/ask/:id/public", setAskPublic);
on("GET", "/api/asks/:id", getSharedAsk);
on("GET", "/api/records", listRecords);
on("GET", "/api/records/facets", recordFacets);
on("GET", "/api/timeline", timeline);
on("GET", "/api/hubs", hubsIndex);
on("GET", "/api/hubs/:kind/:slug", getHub);
on("GET", "/api/releases", releasesApi);
on("GET", "/api/records/:id", getRecord);
on("GET", "/api/records/:id/text", recordText);
on("GET", "/api/file/:id", viewFile);
on("GET", "/api/u/:name", viewUpload);
on("GET", "/api/records/:id/comments", listComments);
on("POST", "/api/records/:id/comments", addComment);
on("POST", "/api/records/:id/verdict", castVerdict);
on("GET", "/api/articles/:slug/poll", getPoll);
on("POST", "/api/articles/:slug/poll", castPoll);
on("GET", "/api/boards/:id/threads", boardThreads);
on("GET", "/api/threads", searchThreads);
on("GET", "/api/threads/:id", getThread);
on("POST", "/api/threads", createThread);
on("POST", "/api/threads/:id/posts", createPost);
on("POST", "/api/votes", toggleVote);
on("POST", "/api/shorts/:id/like", likeShort);
on("GET", "/api/cases/:slug", getCase);
on("GET", "/api/cases/:slug/comments", listCaseComments);
on("POST", "/api/cases/:slug/comments", addCaseComment);
on("GET", "/api/push/config", pushConfig);
on("POST", "/api/push/subscribe", subscribe);
on("POST", "/api/push/prefs", setPrefs);
on("POST", "/api/push/unsubscribe", unsubscribe);
on("GET", "/api/push/me", pushMe);
on("POST", "/api/email/subscribe", emailSubscribe);
on("GET", "/api/email/confirm", emailConfirm);
on("GET", "/api/email/unsubscribe", emailUnsubscribe);
on("GET", "/api/follows", getFollow);
on("POST", "/api/follows", toggleFollow);
on("POST", "/api/follows/merge", mergeFollows);

// Public Developer API v1 (read-only, keyless, CORS-open). See worker/routes/v1.ts.
on("GET", "/api/v1/openapi.json", v1OpenAPI);
on("GET", "/api/v1/records", v1ListRecords);
on("GET", "/api/v1/records/:id", v1GetRecord);
on("GET", "/api/v1/records/:id/text", v1RecordText);
on("GET", "/api/v1/archives", v1Archives);
on("GET", "/api/v1/releases", v1Releases);
on("GET", "/api/v1/cases", v1Cases);
on("GET", "/api/v1/cases/:slug", v1GetCase);
on("GET", "/api/v1/shorts", v1Shorts);
on("GET", "/api/v1/hubs", v1Hubs);
on("GET", "/api/v1/hubs/:kind/:slug", v1GetHub);
on("GET", "/api/v1/usage", v1Usage);
on("POST", "/api/v1/webhooks", createWebhookRoute);
on("GET", "/api/v1/webhooks/:id", getWebhookRoute);
on("DELETE", "/api/v1/webhooks/:id", deleteWebhookRoute);

// X bot first (Spec 4; FEATURE_X gates it), then mirror to other platforms (Spec 5;
// FEATURE_SOCIAL_* gate it). Social failing never affects X.
async function runTick(env: Env) {
  const logErr = (who: string) => (e: unknown) => console.log(JSON.stringify({ [who]: true, crashed: String(e).slice(0, 300) }));
  await sweepStuck(env).catch(logErr("gate")); // first, and independent of FEATURE_X
  await contentTick(env).catch(logErr("contentGate")); // Telegram portal producers: staged records + one short/day
  await tick(env).catch(logErr("xbot"));
  await socialTick(env).catch(logErr("social"));
  await pollTick(env).catch(logErr("xpoll"));
  await pushNewFiles(env).catch(logErr("pushFiles"));
  await pushDaily(env).catch(logErr("pushDaily"));
  await webhookTick(env).catch(logErr("webhooks")); // public API v1 event fan-out
  await emailNewFiles(env).catch(logErr("emailFiles"));
  await hashBackfillTick(env).catch(logErr("hashbackfill")); // SHA-256 backfill: self-terminates at 0 remaining
}

// POST /__tick (Authorization: Bearer ADMIN_TOKEN): one cron tick on demand, for
// scripts/publish.sh. ?force=ID sets X_FORCE_PICK for this call only; ?showcase=ID&text=…
// sets X_FORCE_SHOWCASE/X_SHOWCASE_TEXT. Same work and
// budgets as the cron. Unset ADMIN_TOKEN = endpoint off (404). With FEATURE_GATE=on,
// force/showcase only queue a Telegram preview and answer { ok, job }.
async function manualTick(req: Request, env: Env) {
  const token = env.ADMIN_TOKEN;
  const auth = req.headers.get("authorization") ?? "";
  if (!token || req.method !== "POST" || !(await sameSecret(auth, `Bearer ${token}`))) return error(404, "not found");
  const q = new URL(req.url).searchParams;
  const over: Partial<Env> = {};
  if (q.get("force")) over.X_FORCE_PICK = q.get("force")!;
  if (q.get("showcase")) Object.assign(over, { X_FORCE_SHOWCASE: q.get("showcase")!, X_SHOWCASE_TEXT: q.get("text") ?? "" });
  if (over.X_FORCE_PICK || over.X_FORCE_SHOWCASE) {
    if (gateOn(env)) {
      // gate: an operator post becomes a Telegram preview; the owner's ✅ posts it. job null = nothing queued
      // (a preview already waits, record not live or already posted, or over budget)
      const e = { ...env, ...over }, now = new Date();
      const c = await nextCandidate(e, now);
      const d = c && (await stage(e, c, now));
      const j = c && d ? await queue(e, c, d) : null;
      return json({ ok: true, job: j?.id ?? null });
    }
    over.FEATURE_X = "on"; // gate off: operator post = the user's OK for that item, even while the bot is paused
  }
  await runTick({ ...env, ...over });
  return json({ ok: true });
}

// Record ids fixed after they went live (old → new); their old URLs keep working.
// DOW-UAP: ingest cut "DOW-UAP-PR057a" short (crawler/ingest/mapping.py _CODE).
const RENAMED: Record<string, string> = { "DOW-UAP": "DOW-UAP-PR057a" };
const RENAMED_PATH = /^\/(doc|shorts)\/([^/]+)(\/text)?$/;
// The 49 Pentagon Papers volumes (not UFO files, scraped by mistake) were removed 2026-10-03.
const PENTAGON_PAPERS = /^\/doc\/NARA-Pentagon-Papers-[^/]+(\/text)?$/;

// nara-overview stays on release.realufo.org: it describes NARA UFO holdings this archive doesn't have.
const MOVED_OVERVIEWS: Record<string, string> = { "aaro-overview": "aaro", "nasa-overview": "nasa" };
const LEGACY_PATH = /^\/(aaro|about|argentina|brazil|canada|chile|foia|geipan|glossary|italy|nara|nasa|peru|search|spain|stories|uk|whatsnew)(\/|$)/;

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      return await handleFetch(req, env, ctx);
    } catch (e) {
      // Transient D1 overload (e.g. "D1 DB is overloaded. Requests queued for too
      // long."): retry once after a short backoff instead of surfacing an uncaught
      // exception. Only safe for GET/HEAD — request bodies can't be replayed.
      if (isD1Overload(e) && (req.method === "GET" || req.method === "HEAD")) {
        await new Promise((r) => setTimeout(r, 800));
        try {
          return await handleFetch(req, env, ctx);
        } catch {
          // fall through to the 500 below
        }
      }
      console.error("fetch uncaught", e instanceof Error ? e.message : e);
      return error(500, "internal error");
    }
  },
  async scheduled(_c: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runTick(env));
  },
} satisfies ExportedHandler<Env>;

// D1 overload signatures worth one retry: the database was momentarily saturated,
// not a query bug. Matches "D1 DB is overloaded. Requests queued for too long."
const isD1Overload = (e: unknown): boolean => {
  const m = e instanceof Error ? e.message : String(e);
  return /D1.*overload|overload.*D1|D1_ERROR/i.test(m);
};

async function handleFetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (url.hostname.startsWith("www.")) return Response.redirect(`https://${url.hostname.slice(4)}${url.pathname}${url.search}`, 301);
    // The old static site moved to release.realufo.org; its realufo.org URLs are
    // still in search indexes. /map and /timeline stay: this app has its own.
    // Stories folded into case pages (spec 2026-10-03-realufo-case-stories-design):
    // straight to /case, no apex → subdomain → apex chain.
    const moved = /^\/stories\/([a-z0-9-]+)\/?$/.exec(url.pathname)?.[1];
    if (moved && Object.hasOwn(CASE_STORY_TEXT, moved)) return Response.redirect(`${url.origin}/case/${moved}`, 301);
    // Overviews folded into agency hubs (spec 2026-10-03-realufo-case-stories-batch2-design).
    if (moved && Object.hasOwn(MOVED_OVERVIEWS, moved)) return Response.redirect(`${url.origin}/agency/${MOVED_OVERVIEWS[moved]}`, 301);
    if (LEGACY_PATH.test(url.pathname)) {
      const p = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
      return Response.redirect(`https://release.realufo.org${p}${url.search}`, 301);
    }
    const renamed = url.pathname.match(RENAMED_PATH);
    const to = renamed && RENAMED[renamed[2]]; // keys are plain ASCII: no decode (a bad % would throw)
    if (to) return Response.redirect(`${url.origin}/${renamed[1]}/${encodeURIComponent(to)}${renamed[3] ?? ""}${url.search}`, 301);
    // /shorts has no index page (only the /shorts/:id player): the Shorts list is the archive's Shorts filter.
    if (/^\/shorts\/?$/.test(url.pathname)) {
      url.searchParams.set("type", "shorts");
      return Response.redirect(`${url.origin}/archive?${url.searchParams}`, 301);
    }
    if (PENTAGON_PAPERS.test(url.pathname)) return Response.redirect("https://www.archives.gov/research/pentagon-papers", 301);
    if (url.pathname.startsWith("/api/v1/") && req.method === "OPTIONS") return v1Preflight();
    if (url.pathname.startsWith("/api/")) {
      const res = await dispatch(req, env, ctx);
      return res ?? error(404, "not found");
    }
    if (url.pathname === "/__tick") return manualTick(req, env);
    if (url.pathname === "/__hash-assets") return hashAssets(req, env);
    if (url.pathname === "/__tg") return tgWebhook(req, env);
    if (url.pathname === "/__job") return jobRoute(req, env);
    if (url.pathname === "/sitemap.xml") return sitemap(req, env);
    if (/^\/(rss(\.xml)?|feed(\.xml)?)$/.test(url.pathname)) return rss(req, env);
    if (url.pathname === "/llms.txt") return llms(req, env);
    if (url.pathname === "/llms-full.txt") return llmsFull(req, env);
    // Embeddable badge + record card (framable by design).
    if (url.pathname === "/embed/badge") return badge(req, env);
    const embedCard = url.pathname.match(/^\/embed\/card\/([^/]+)$/);
    if (embedCard) return card(req, env, { id: decodeURIComponent(embedCard[1]) });
    const docText = url.pathname.match(/^\/doc\/([^/]+)\/text$/);
    if (docText) return recordText(req, env, { id: decodeURIComponent(docText[1]) });
    return serveWithMeta(req, env); // SPA + assets, with per-route meta/OG injection for deep links
}
