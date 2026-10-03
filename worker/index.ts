import type { Env } from "./env";
import { on, dispatch } from "./router";
import { error, json } from "./lib/json";
import { health } from "./routes/health";
import { bootstrap } from "./routes/bootstrap";
import { feed } from "./routes/feed";
import { listRecords, getRecord, recordFacets } from "./routes/records";
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
import { hubsIndex, getHub } from "./routes/hubs";
import { tick } from "./lib/xbot";
import { tick as socialTick } from "./lib/social/tick";

on("GET", "/api/health", health);
on("GET", "/api/bootstrap", bootstrap);
on("GET", "/api/feed", feed);
on("GET", "/api/ask", ask);
on("GET", "/api/ask/recent", recentAsks);
on("POST", "/api/ask/:id/public", setAskPublic);
on("GET", "/api/asks/:id", getSharedAsk);
on("GET", "/api/records", listRecords);
on("GET", "/api/records/facets", recordFacets);
on("GET", "/api/hubs", hubsIndex);
on("GET", "/api/hubs/:kind/:slug", getHub);
on("GET", "/api/records/:id", getRecord);
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
on("GET", "/api/cases/:slug", getCase);
on("GET", "/api/cases/:slug/comments", listCaseComments);
on("POST", "/api/cases/:slug/comments", addCaseComment);

// X bot first (Spec 4; FEATURE_X gates it), then mirror to other platforms (Spec 5;
// FEATURE_SOCIAL_* gate it). Social failing never affects X.
async function runTick(env: Env) {
  const logErr = (who: string) => (e: unknown) => console.log(JSON.stringify({ [who]: true, crashed: String(e).slice(0, 300) }));
  await tick(env).catch(logErr("xbot"));
  await socialTick(env).catch(logErr("social"));
}

// POST /__tick (Authorization: Bearer ADMIN_TOKEN): one cron tick on demand, for
// scripts/publish.sh. ?force=ID sets X_FORCE_PICK for this call only; ?showcase=ID&text=…
// sets X_FORCE_SHOWCASE/X_SHOWCASE_TEXT. Same work and
// budgets as the cron. Unset ADMIN_TOKEN = endpoint off (404).
async function manualTick(req: Request, env: Env) {
  const token = env.ADMIN_TOKEN;
  const auth = req.headers.get("authorization") ?? "";
  if (!token || req.method !== "POST" || !(await sameSecret(auth, `Bearer ${token}`))) return error(404, "not found");
  const q = new URL(req.url).searchParams;
  const over: Partial<Env> = {};
  if (q.get("force")) over.X_FORCE_PICK = q.get("force")!;
  if (q.get("showcase")) Object.assign(over, { X_FORCE_SHOWCASE: q.get("showcase")!, X_SHOWCASE_TEXT: q.get("text") ?? "" });
  await runTick({ ...env, ...over });
  return json({ ok: true });
}

// Constant-time compare (hash both, then compare digests).
async function sameSecret(a: string, b: string) {
  const h = async (s: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  const [x, y] = [await h(a), await h(b)];
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

export default {
  async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (url.hostname.startsWith("www.")) return Response.redirect(`https://${url.hostname.slice(4)}${url.pathname}${url.search}`, 301);
    if (url.pathname.startsWith("/api/")) {
      const res = await dispatch(req, env);
      return res ?? error(404, "not found");
    }
    if (url.pathname === "/__tick") return manualTick(req, env);
    if (url.pathname === "/sitemap.xml") return sitemap(req, env);
    if (url.pathname === "/rss.xml") return rss(req, env);
    if (url.pathname === "/llms.txt") return llms(req, env);
    if (url.pathname === "/llms-full.txt") return llmsFull(req, env);
    return serveWithMeta(req, env); // SPA + assets, with per-route meta/OG injection for deep links
  },
  async scheduled(_c: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runTick(env));
  },
} satisfies ExportedHandler<Env>;
