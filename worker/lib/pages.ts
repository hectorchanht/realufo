import type { Env } from "../env";
import type { MetaInput } from "./meta";
import { thumbSql } from "./db";
import { uploadUrl } from "./upload";
import { loadRecord } from "../routes/records";
import { loadHub, listHubsCached } from "../routes/hubs";
import type { HubKind } from "./hubs";
import {
  DEFAULT_DESCRIPTION, type DocData, type Link, docBody, docFooter, threadBody, boardBody, caseBody, homeBody, tabBody,
  section, docLinks, countList, docTitle, docTitleParts, boardHref, docHref, hubBody, browseBody, hubHref,
} from "./ssr";

// One SPA route's pre-render: <head> meta (url is filled in by serveWithMeta)
// and the HTML that goes inside #root. A loader returns null when the entity
// doesn't exist; serveWithMeta then serves index.html untouched.
export type Page = { meta: Omit<MetaInput, "url">; body: string; footer?: Link[] };
export type Loader = (env: Env, groups: Record<string, string>, url: URL) => Promise<Page | null>;

// records.doc_date is "M/D/YY" (war.gov) or a bare year (AARO) → ISO 8601 date.
export const isoDate = (d: string | null | undefined) => {
  const m = d?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return d && /^\d{4}(-\d{2}){0,2}$/.test(d) ? d : undefined;
};

// D1 "YYYY-MM-DD HH:MM:SS" (UTC) → ISO 8601.
const iso = (d: string | null) => (d ? d.replace(" ", "T") + "Z" : undefined);
const person = (handle: string | null) => ({ "@type": "Person", name: handle || "Anonymous" });
export { docTitle }; // sitemap + llms import it from here

const latest = async (env: Env) =>
  (
    await env.DB.prepare("SELECT id,title,kind FROM records WHERE status='live' ORDER BY created_at DESC, id LIMIT 30").all<{
      id: string; title: string; kind: string;
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
  // AI answers can be wrong: never indexed.
  ask: {
    title: "Ask the Archive",
    description: "Ask a question and get an AI answer drawn from the declassified UAP files, with sources.",
    type: "website" as const,
    robots: "noindex",
  },
};

const homePage: Loader = async (env, _g, url) => ({
  meta: {
    title: "Declassified UAP Archive",
    description: DEFAULT_DESCRIPTION,
    type: "website",
    jsonLd: {
      "@type": "WebSite",
      name: "RealUFO",
      sameAs: ["https://x.com/realufoorg"],
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
const askPage: Loader = async () => ({ meta: TAB.ask, body: tabBody(TAB.ask.title, TAB.ask.description) });

const docPage: Loader = async (env, g, url) => {
  const d = (await loadRecord(env, g.id, url.origin)) as DocData | null;
  if (!d) return null;
  const x = d.record;
  const agency = x.agency_full || x.agency;
  // Official summary unless it's a one-liner (AARO/NARA) and an AI summary exists;
  // no summary at all → build one from the record's facts.
  const ai = d.fullText?.aiSummary;
  const base = ((ai && (x.summary ?? "").length < 80 ? ai : x.summary) || "").trim();
  // Under ~100 chars (AARO videos with no summary, one-line image captions): add a
  // sentence from the facts so the search snippet says what and where the file is.
  const what = { pdf: "document", video: "video", image: "image" }[x.kind] ?? "file";
  const verb = { pdf: "Read the original document", video: "Watch the original footage", image: "View the full-resolution image" }[x.kind] ?? "Open the original file";
  const when = [x.incident_date, x.location && x.location !== "N/A" ? x.location : null].filter(Boolean).join(", ");
  const lead = `Declassified UAP ${what}${agency ? ` from ${agency}` : ""}${base ? "" : `: ${docTitleParts(x.id, x.title, x.kind).title}`}${when ? ` (${when})` : ""}.`;
  const description = base.length >= 100 ? base : [base && (/[.!?]$/.test(base) ? base : base + "."), lead, `${verb} on RealUFO.`].filter(Boolean).join(" ");
  const title = docTitle(x.title, x.id, x.kind);
  // Same pick as thumbSql, from the assets already loaded.
  const thumb =
    d.assets.find((a) => a.role === "thumb") ?? d.assets.find((a) => a.role === "full" && a.mime?.startsWith("image/"));
  const full = d.assets.find((a) => a.role === "full");
  const dur = full?.duration;
  // Video/image types make the file eligible for video and image search results.
  const media =
    x.kind === "video" && full
      ? {
          "@type": "VideoObject", thumbnailUrl: thumb?.cdn_url, contentUrl: full.cdn_url,
          // Required by Google; AARO has no release date, so fall back to when we added it.
          uploadDate: isoDate(x.doc_date) || x.created_at?.slice(0, 10),
          duration: dur ? `PT${Math.floor(dur / 60)}M${Math.floor(dur % 60)}S` : undefined,
        }
      : x.kind === "image" && full
        ? { "@type": "ImageObject", contentUrl: full.cdn_url, thumbnailUrl: thumb?.cdn_url, creditText: agency || undefined }
        : { "@type": "DigitalDocument" };
  return {
    meta: {
      title, description, image: thumb?.cdn_url ?? null,
      jsonLd: {
        ...media, name: title, identifier: x.id, description,
        dateCreated: isoDate(x.doc_date), contentLocation: x.location || undefined,
        publisher: agency ? { "@type": "GovernmentOrganization", name: agency } : undefined,
      },
      breadcrumbs: [
        { name: "Home", href: "/" },
        { name: "Archive", href: "/archive" },
        { name: x.id, href: docHref(x.id) },
      ],
    },
    body: docBody(d),
    footer: docFooter(d),
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
        image: (h.records.find((r) => r.thumb)?.thumb as string | undefined) ?? null,
        type: "website",
        jsonLd: {
          "@type": "CollectionPage",
          name: h.title,
          description: h.intro,
          mainEntity: {
            "@type": "ItemList",
            numberOfItems: h.records.length,
            itemListElement: h.records.map((r, i) => ({ "@type": "ListItem", position: i + 1, url: `${url.origin}${docHref(r.id)}`, name: docTitle(r.title, r.id, r.kind) })),
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
  { pattern: new URLPattern({ pathname: "/ask" }), load: askPage },
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
