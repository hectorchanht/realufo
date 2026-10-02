import type { Env } from "../env";
import type { MetaInput } from "./meta";
import { thumbSql } from "./db";
import { uploadUrl } from "./upload";
import { loadRecord } from "../routes/records";
import { loadHub, listHubsCached } from "../routes/hubs";
import type { HubKind } from "./hubs";
import {
  DEFAULT_DESCRIPTION, type DocData, docBody, threadBody, boardBody, caseBody, homeBody, tabBody,
  section, docLinks, countList, boardHref, docHref, hubBody, browseBody, hubHref,
} from "./ssr";

// One SPA route's pre-render: <head> meta (url is filled in by serveWithMeta)
// and the HTML that goes inside #root. A loader returns null when the entity
// doesn't exist; serveWithMeta then serves index.html untouched.
export type Page = { meta: Omit<MetaInput, "url">; body: string };
export type Loader = (env: Env, groups: Record<string, string>, url: URL) => Promise<Page | null>;

// D1 "YYYY-MM-DD HH:MM:SS" (UTC) → ISO 8601.
const iso = (d: string | null) => (d ? d.replace(" ", "T") + "Z" : undefined);
const person = (handle: string | null) => ({ "@type": "Person", name: handle || "Anonymous" });
// Same as Doc.tsx's shortTitle: drop a leading "<ID>, " prefix.
const shortTitle = (t: string) => {
  const c = t.indexOf(",");
  return (c > 0 && c < 34 ? t.slice(c + 1).trim() : t).replace(/_/g, " ");
};

const latest = async (env: Env) =>
  (
    await env.DB.prepare("SELECT id,title FROM records WHERE status='live' ORDER BY created_at DESC, id LIMIT 30").all<{
      id: string; title: string;
    }>()
  ).results;

const TAB = {
  archive: {
    title: "The Archive",
    description: "Browse and search every declassified UAP record — PDFs, images and video from AARO, the Pentagon, CIA, FBI and NASA.",
    type: "website" as const,
  },
  boards: {
    title: "The Boards",
    description: "Anonymous discussion boards for UAP sightings, declassified files and cold cases.",
    type: "website" as const,
  },
  map: { title: "Sighting Map", description: "Map of where the declassified UAP files come from.", type: "website" as const },
};

const homePage: Loader = async (env, _g, url) => ({
  meta: {
    title: "Declassified UAP Archive",
    description: DEFAULT_DESCRIPTION,
    type: "website",
    jsonLd: {
      "@type": "WebSite",
      name: "RealUFO",
      potentialAction: {
        "@type": "SearchAction",
        target: `${url.origin}/archive?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
  },
  body: homeBody(await latest(env)),
});

const archivePage: Loader = async (env) => {
  const [agencies, recent] = await Promise.all([
    env.DB.prepare(
      "SELECT agency name, count(*) count FROM records WHERE status='live' AND agency IS NOT NULL AND trim(agency)<>'' GROUP BY agency ORDER BY count DESC, name"
    ).all<{ name: string; count: number }>(),
    latest(env),
  ]);
  const t = TAB.archive;
  return { meta: t, body: tabBody(t.title, t.description, countList("Agencies", agencies.results), section("Latest files", docLinks(recent))) };
};

const boardsPage: Loader = async (env) => {
  const { results } = await env.DB.prepare("SELECT slug,name,desc FROM boards ORDER BY rowid").all<{
    slug: string; name: string; desc: string | null;
  }>();
  const t = TAB.boards;
  const links = results.map((b) => ({ href: boardHref(b.slug), text: b.desc ? `${b.name} — ${b.desc}` : b.name }));
  return { meta: t, body: tabBody(t.title, t.description, section("Boards", links)) };
};

const mapPage: Loader = async () => ({ meta: TAB.map, body: tabBody(TAB.map.title, TAB.map.description) });

const docPage: Loader = async (env, g, url) => {
  const d = (await loadRecord(env, g.id, url.origin)) as DocData | null;
  if (!d) return null;
  const x = d.record;
  const agency = x.agency_full || x.agency;
  // No summary → build one from the record's facts rather than an empty description.
  const facts = [agency, x.incident_date, x.location].filter(Boolean).join(" · ");
  const description = x.summary || (facts ? `Declassified UAP record — ${facts}.` : "");
  // Matches the SPA's tab title (Doc.tsx): "<short title> — UAP file <id>".
  const title = `${shortTitle(x.title)} — UAP file ${x.id}`;
  // Same pick as thumbSql, from the assets already loaded.
  const thumb =
    d.assets.find((a) => a.role === "thumb") ?? d.assets.find((a) => a.role === "full" && a.mime?.startsWith("image/"));
  return {
    meta: {
      title, description, image: thumb?.cdn_url ?? null,
      jsonLd: {
        "@type": "DigitalDocument", name: title, identifier: x.id, description,
        dateCreated: x.doc_date || undefined, contentLocation: x.location || undefined,
        publisher: agency ? { "@type": "GovernmentOrganization", name: agency } : undefined,
      },
      breadcrumbs: [
        { name: "Home", href: "/" },
        { name: "Archive", href: "/archive" },
        { name: x.id, href: docHref(x.id) },
      ],
    },
    body: docBody(d),
  };
};

const boardPage: Loader = async (env, g) => {
  // URL slug is bare ("uap"), the column is slash-wrapped ("/uap/").
  const x = await env.DB.prepare("SELECT id,name,desc FROM boards WHERE slug=?")
    .bind(`/${g.slug}/`)
    .first<{ id: string; name: string; desc: string | null }>();
  if (!x) return null;
  const { results: threads } = await env.DB.prepare(
    "SELECT id,title FROM threads WHERE board_id=? ORDER BY created_at DESC LIMIT 50"
  )
    .bind(x.id)
    .all<{ id: string; title: string }>();
  return {
    meta: {
      title: x.name, description: x.desc || "", type: "website",
      jsonLd: { "@type": "CollectionPage", name: x.name, description: x.desc || undefined },
    },
    body: boardBody({ name: x.name, desc: x.desc, threads }),
  };
};

const casePage: Loader = async (env, g) => {
  const [x, thread] = await Promise.all([
    env.DB.prepare("SELECT name,lede,pull,pull_cite FROM cases WHERE slug=?")
      .bind(g.slug)
      .first<{ name: string; lede: string | null; pull: string | null; pull_cite: string | null }>(),
    env.DB.prepare("SELECT id,title FROM threads WHERE case_slug=? LIMIT 1").bind(g.slug).first<{ id: string; title: string }>(),
  ]);
  if (!x) return null;
  const description = (x.lede || "").slice(0, 200);
  return {
    meta: { title: x.name, description, jsonLd: { "@type": "Article", headline: x.name, description } },
    body: caseBody({ ...x, thread }),
  };
};

const threadPage: Loader = async (env, g) => {
  const x = await env.DB.prepare(
    `SELECT t.title,t.op_body,t.op_handle,t.reply_count,t.created_at,t.source_record_id,b.slug board_slug,b.name board_name,
       ${thumbSql("t.source_record_id")} thumb
     FROM threads t LEFT JOIN boards b ON b.id=t.board_id WHERE t.id=?`
  )
    .bind(g.id)
    .first<{
      title: string; op_body: string | null; op_handle: string | null; reply_count: number; created_at: string | null;
      source_record_id: string | null; board_slug: string | null; board_name: string | null; thumb: string | null;
    }>();
  if (!x) return null;
  // ponytail: first 50 replies only; page the JSON-LD/body if threads get huge.
  const { results: posts } = await env.DB.prepare(
    "SELECT body,handle,image_r2_key,is_op,created_at FROM posts WHERE thread_id=? ORDER BY is_op DESC, created_at ASC LIMIT 51"
  )
    .bind(g.id)
    .all<{ body: string; handle: string | null; image_r2_key: string | null; is_op: number; created_at: string | null }>();
  const op = posts.find((p) => p.is_op);
  const replies = posts.filter((p) => !p.is_op);
  return {
    meta: {
      title: x.title,
      description: (x.op_body || "").slice(0, 200),
      image: uploadUrl(env, op?.image_r2_key ?? null) || x.thumb,
      jsonLd: {
        "@type": "DiscussionForumPosting",
        headline: x.title,
        text: x.op_body || "",
        author: person(x.op_handle),
        datePublished: iso(x.created_at),
        commentCount: x.reply_count,
        comment: replies.map((p) => ({ "@type": "Comment", text: p.body, author: person(p.handle), datePublished: iso(p.created_at) })),
      },
    },
    body: threadBody({
      title: x.title, boardSlug: x.board_slug, boardName: x.board_name, sourceRecordId: x.source_record_id,
      opBody: x.op_body, opHandle: x.op_handle, replies,
    }),
  };
};

const hubPage =
  (kind: HubKind): Loader =>
  async (env, g, url) => {
    const h = await loadHub(env, kind, g.slug, url.origin);
    if (!h) return null;
    return {
      meta: {
        title: h.title,
        description: h.intro,
        type: "website",
        jsonLd: {
          "@type": "CollectionPage",
          name: h.title,
          description: h.intro,
          mainEntity: {
            "@type": "ItemList",
            numberOfItems: h.records.length,
            itemListElement: h.records.map((r, i) => ({ "@type": "ListItem", position: i + 1, url: `${url.origin}${docHref(r.id)}`, name: r.title })),
          },
        },
        breadcrumbs: [
          { name: "Home", href: "/" },
          { name: "Browse", href: "/browse" },
          { name: h.title, href: hubHref(kind, h.slug) },
        ],
      },
      body: hubBody(h),
    };
  };

const browsePage: Loader = async (env, _g, url) => ({
  meta: {
    title: "Browse the archive",
    description: "Every declassified UAP file, grouped by release, agency, location and decade.",
    type: "website",
  },
  body: browseBody(await listHubsCached(env, url.origin)),
});

export const ROUTES: { pattern: URLPattern; load: Loader }[] = [
  { pattern: new URLPattern({ pathname: "/" }), load: homePage },
  { pattern: new URLPattern({ pathname: "/archive" }), load: archivePage },
  { pattern: new URLPattern({ pathname: "/boards" }), load: boardsPage },
  { pattern: new URLPattern({ pathname: "/map" }), load: mapPage },
  { pattern: new URLPattern({ pathname: "/browse" }), load: browsePage },
  { pattern: new URLPattern({ pathname: "/release/:slug" }), load: hubPage("release") },
  { pattern: new URLPattern({ pathname: "/agency/:slug" }), load: hubPage("agency") },
  { pattern: new URLPattern({ pathname: "/location/:slug" }), load: hubPage("location") },
  { pattern: new URLPattern({ pathname: "/decade/:slug" }), load: hubPage("decade") },
  { pattern: new URLPattern({ pathname: "/doc/:id" }), load: docPage },
  { pattern: new URLPattern({ pathname: "/case/:slug" }), load: casePage },
  { pattern: new URLPattern({ pathname: "/thread/:id" }), load: threadPage },
  { pattern: new URLPattern({ pathname: "/board/:slug" }), load: boardPage },
];
