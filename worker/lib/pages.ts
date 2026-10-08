import type { Env } from "../env";
import { storyView } from "../routes/cases";
import type { MetaInput } from "./meta";
import { thumbSql } from "./db";
import { uploadUrl } from "./upload";
import { loadRecord } from "../routes/records";
import { loadHub, listHubsCached, pageOf } from "../routes/hubs";
import type { HubKind } from "./hubs";
import {
  DEFAULT_DESCRIPTION, type DocData, type Link, docBody, docFooter, threadBody, boardBody, caseBody, homeBody, tabBody,
  section, docLinks, countList, docTitle, boardHref, docHref, hubBody, browseBody, hubHref, docMoments, snippet, askBody, distinctSummary, releasesBody,
} from "./ssr";
import { loadSharedAsk } from "../routes/ask";
import { askHref, askIdOf } from "./ask";
import { PRIVACY_HTML } from "./privacy";
import { TERMS_HTML } from "./terms";
import { SOCIAL_PROFILES } from "./profiles";
import { ALL_PICKS, affiliateUrl } from "./affiliate";
import { MAP_INTRO, RELEASES_DESCRIPTION, RELEASES_TITLE } from "./shared";
import { PLACES, placeSlug } from "./places";
import { yearOf } from "./facets";
import { trackerData } from "../routes/releases";
import { agencyList, longDate } from "./releases";
import { TOPIC_RULES, firstSentence } from "./topics";
import { CASE_STORY_TEXT } from "./caseStoryText";

// One SPA route's pre-render: <head> meta (url is filled in by serveWithMeta)
// and the HTML that goes inside #root. A loader returns null when the entity
// doesn't exist; serveWithMeta then serves index.html untouched.
// canonicalPath: overrides the request path as the canonical URL (a shared
// answer's duplicates point at the earliest copy).
// noStore: a degraded fallback — served, but never memoized (meta.ts cachedPage).
export type Page = { meta: Omit<MetaInput, "url">; body: string; footer?: Link[]; canonicalPath?: string; noStore?: boolean };
export type Loader = (env: Env, groups: Record<string, string>, url: URL) => Promise<Page | null>;
// cacheKey: extra page-HTML memo key derived from the URL. Hub routes paginate
// via ?page=N, so each page gets its own cached render.

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
  leaderboard: {
    title: "WTF Leaderboard",
    description: "The declassified UAP files the crowd finds hardest to explain, ranked by unexplained votes this month.",
    type: "website" as const,
  },
  cases: {
    title: "Cold Cases",
    description: "Famous UAP cases, what the official record says, and where to discuss them.",
    type: "website" as const,
  },
  map: { title: "Sighting Map", description: "Map of where the declassified UAP files come from: every place named in Pentagon, AARO, FBI, CIA and NASA records, with file counts.", type: "website" as const },
  // Bare /ask (question box + shared answers) is indexable; /ask?q= is not (lib/meta.ts).
  ask: {
    title: "Ask the Archive",
    description: "Ask a question and get an AI answer drawn from the declassified UAP files, with sources.",
    type: "website" as const,
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
      publisher: { "@type": "Organization", name: "RealUFO", url: url.origin, sameAs: SOCIAL_PROFILES.map(([, u]) => u) },
      potentialAction: {
        "@type": "SearchAction",
        target: `${url.origin}/archive?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
  },
  body: homeBody(await latest(env)),
});

const archivePage: Loader = async (env, _g, url) => {
  const [agencies, recent, total] = await Promise.all([
    env.DB.prepare(
      "SELECT agency name, count(*) count FROM records WHERE status='live' AND agency IS NOT NULL AND trim(agency)<>'' GROUP BY agency ORDER BY count DESC, name"
    ).all<{ name: string; count: number }>(),
    latest(env),
    env.DB.prepare("SELECT count(*) c FROM records WHERE status='live'").first<{ c: number }>(),
  ]);
  const t = TAB.archive;
  const origin = url?.origin ?? "https://realufo.org";
  const count = total?.c ?? 0;
  // schema.org/Dataset for Google Dataset Search. serveWithMeta adds
  // @context/url/image; license points at the terms page (mirrored
  // US-federal fields are public domain, site-generated text is the
  // site's own — the terms page governs reuse).
  const datasetLd = {
    "@type": "Dataset",
    name: "RealUFO Declassified UAP Archive",
    description:
      `${count} declassified UAP records mirrored from the Pentagon's UAP disclosure library ` +
      `(war.gov), AARO, NARA, NASA and DoD FOIA releases — PDFs, video and images with OCR full text, ` +
      `AI summaries and source files. Queryable via a free keyless JSON API.`,
    keywords: ["UAP", "UFO", "declassified", "DoD", "AARO", "FOIA", "Pentagon"],
    license: `${origin}/terms`,
    isAccessibleForFree: true,
    creator: { "@type": "Organization", name: "RealUFO", url: origin },
    distribution: [
      {
        "@type": "DataDownload",
        name: "RealUFO Public API v1",
        contentUrl: `${origin}/api/v1/openapi.json`,
        encodingFormat: "application/json",
        description: "Keyless, CORS-open JSON API over every record, case story, release and hub.",
      },
      {
        "@type": "DataDownload",
        name: "Open dataset (Hugging Face)",
        contentUrl: "https://huggingface.co/datasets/realufo/realufo-uap-archive",
        encodingFormat: "application/json",
        description: "Record metadata and page text as JSONL.",
      },
    ],
  };
  return {
    meta: { ...t, jsonLd: datasetLd },
    body: tabBody(t.title, t.description, countList("Agencies", agencies.results), section("Latest files", docLinks(recent))),
  };
};

const boardsPage: Loader = async (env) => {
  const { results } = await env.DB.prepare("SELECT slug,name,desc FROM boards ORDER BY rowid").all<{
    slug: string; name: string; desc: string | null;
  }>();
  const t = TAB.boards;
  const links = results.map((b) => ({ href: boardHref(b.slug), text: b.desc ? `${b.name} — ${b.desc}` : b.name }));
  return { meta: t, body: tabBody(t.title, t.description, section("Boards", links)) };
};

// /leaderboard — top 30 by unexplained ("WTF") votes in the trailing 30 days,
// with schema.org ItemList for SEO. The SPA takes over for week/month tabs.
const leaderboardPage: Loader = async (env, _g, url) => {
  const t = TAB.leaderboard;
  const { results } = await env.DB.prepare(
    `SELECT r.id, r.title, r.kind,
       (SELECT count(*) FROM record_verdicts v WHERE v.record_id=r.id AND v.verdict='unexplained'
        AND v.updated_at >= datetime('now','-30 days')) wtfCount
     FROM records r WHERE r.status='live'
     ORDER BY wtfCount DESC, r.created_at DESC LIMIT 30`
  ).all<{ id: string; title: string | null; kind: string; wtfCount: number }>();
  const origin = url?.origin ?? "https://realufo.org";
  const links = results.map((r) => ({
    href: docHref(r.id),
    text: `${docTitle(r.title ?? r.id, r.id, r.kind)} — ${r.wtfCount} unexplained votes`,
  }));
  return {
    meta: {
      ...t,
      jsonLd: {
        "@type": "ItemList",
        name: t.title,
        itemListElement: results.map((r, i) => ({
          "@type": "ListItem",
          position: i + 1,
          url: `${origin}${docHref(r.id)}`,
          name: docTitle(r.title ?? r.id, r.id, r.kind),
        })),
      },
    },
    body: tabBody(t.title, t.description, section("Top 30 this month", links)),
  };
};

const casesPage: Loader = async (env) => {
  const { results } = await env.DB.prepare("SELECT slug,name,lede FROM cases ORDER BY name").all<{ slug: string; name: string; lede: string | null }>();
  const t = TAB.cases;
  const links = results.map((c) => ({ href: `/case/${encodeURIComponent(c.slug)}`, text: c.lede ? `${c.name} — ${snippet(c.lede, 140)}` : c.name }));
  return { meta: t, body: tabBody(t.title, t.description, section("Cases", links)) };
};

// Crawlers get the places as links: the map itself is canvas-and-buttons.
const mapPage: Loader = async (env, _g, url) => {
  const places = (await listHubsCached(env, url.origin)).filter((h) => h.kind === "location").sort((p, q) => q.count - p.count);
  return {
    meta: TAB.map,
    body: tabBody(TAB.map.title, `${TAB.map.description} ${MAP_INTRO}`,
      section("Places in the archive", places.map((p) => ({ href: hubHref(p.kind, p.slug), text: `${p.label} (${p.count} files)` })))),
  };
};
const askPage: Loader = async () => ({ meta: TAB.ask, body: tabBody(TAB.ask.title, TAB.ask.description) });

const timelinePage: Loader = async () => ({
  meta: {
    title: "Sightings Timeline",
    description: "Every dated UAP sighting in the archive, year by year — each year has its own shareable link.",
    type: "website" as const,
  },
  body: tabBody("Sightings Timeline", "Every dated sighting in the archive, year by year. Open a year to see its files."),
});

// /timeline/:year — one year's slice of the timeline. A malformed year returns
// null so serveWithMeta serves index.html untouched (the SPA bounces to /timeline).
const timelineYearPage: Loader = async (env, g, url) => {
  const y = g.year ?? "";
  if (!/^\d{4}$/.test(y)) return null;
  // Same yearOf() parsing the /api/timeline counts use, so the SSR file list
  // matches what the chart shows. Cached per path by serveWithMeta.
  const rows = await env.DB.prepare(
    "SELECT id, title, kind, incident_date FROM records WHERE status='live' AND incident_date IS NOT NULL AND trim(incident_date) NOT IN ('','N/A')"
  ).all<{ id: string; title: string; kind: string; incident_date: string }>();
  const files = (rows.results ?? []).filter((r) => yearOf(r.incident_date) === y).slice(0, 30);
  const links = docLinks(files);
  return {
    meta: {
      title: `${y} UAP Sightings — Timeline`,
      description: `Declassified UAP files from ${y}, on the RealUFO sightings timeline.`,
      type: "website" as const,
      jsonLd: {
        "@type": "CollectionPage",
        name: `${y} UAP Sightings — Timeline`,
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: files.length,
          itemListElement: files.map((r, i) => ({ "@type": "ListItem", position: i + 1, url: `${url.origin}${docHref(r.id)}`, name: docTitle(r.title, r.id, r.kind) })),
        },
      },
      breadcrumbs: [
        { name: "Home", href: "/" },
        { name: "Timeline", href: "/timeline" },
        { name: y, href: `/timeline/${y}` },
      ],
    },
    body: tabBody(
      `${y} Sightings`,
      `Declassified UAP files from ${y} — open the year on the timeline.`,
      section(`Files from ${y}`, links)
    ),
  };
};

// /map/:place — one map place's panel. The slug resolves against PLACES (the
// same list the web app slugifies); unknown slugs return null so serveWithMeta
// serves index.html untouched (the SPA bounces to /map).
const mapPlacePage: Loader = async (env, g, url) => {
  const slug = g.place ?? "";
  const place = /^[a-z0-9-]{1,64}$/.test(slug) ? PLACES.find((p) => placeSlug(p.name) === slug) : undefined;
  if (!place) return null;
  const inList = place.values.map(() => "?").join(",");
  const rows = await env.DB.prepare(
    `SELECT id, title, kind FROM records WHERE status='live' AND location IN (${inList}) LIMIT 30`
  )
    .bind(...place.values)
    .all<{ id: string; title: string; kind: string }>();
  const files = rows.results ?? [];
  const links = docLinks(files);
  return {
    meta: {
      title: `${place.name} UAP Sightings — Map`,
      description: `Declassified UAP files from ${place.name}, on the RealUFO sighting map.`,
      type: "website" as const,
      jsonLd: {
        "@type": "CollectionPage",
        name: `${place.name} UAP Sightings — Map`,
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: files.length,
          itemListElement: files.map((r, i) => ({ "@type": "ListItem", position: i + 1, url: `${url.origin}${docHref(r.id)}`, name: docTitle(r.title, r.id, r.kind) })),
        },
      },
      breadcrumbs: [
        { name: "Home", href: "/" },
        { name: "Sighting Map", href: "/map" },
        { name: place.name, href: `/map/${slug}` },
      ],
    },
    body: tabBody(
      `${place.name} — Sighting Map`,
      `Declassified UAP files from ${place.name} — open the place on the map.`,
      section(`Files from ${place.name}`, links)
    ),
  };
};

// A shared Ask answer (Spec 8 §2): indexed, unlike the /ask tab. Duplicate
// shares of one question canonicalise to the earliest public copy.
const sharedAskPage: Loader = async (env, g, url) => {
  const x = await loadSharedAsk(env, askIdOf(g.id));
  if (!x) return null;
  // ponytail: lower(question) scans ask_log; add an expression index ON ask_log(lower(question)) WHERE public=1 if it grows large.
  const first = await env.DB.prepare(
    "SELECT min(id) id, question FROM ask_log WHERE public=1 AND answer IS NOT NULL AND lower(question)=lower(?)"
  )
    .bind(x.question)
    .first<{ id: number | null; question: string }>();
  const canonicalPath = first?.id ? askHref(first.id, first.question) : x.url;
  const files = [...new Map(x.sources.map((s) => [s.record_id, s])).values()];
  const n = files.length;
  return {
    meta: {
      title: x.question,
      description: `AI answer from ${n} declassified UAP ${n === 1 ? "file" : "files"}: ${x.answer.replace(/\s*\[\d+\]/g, "")}`,
      image: x.sources.find((s) => s.thumb)?.thumb ?? null,
      type: "article",
      jsonLd: {
        "@type": "WebPage",
        name: x.question,
        datePublished: iso(x.asked_at),
        citation: files.map((s) => ({ "@type": "CreativeWork", name: s.title, url: url.origin + docHref(s.record_id) })),
      },
      breadcrumbs: [
        { name: "Home", href: "/" },
        { name: "Ask the Archive", href: "/ask" },
        { name: x.question, href: canonicalPath },
      ],
    },
    body: askBody(x),
    canonicalPath,
  };
};

const docPage: Loader = async (env, g, url) => {
  const d = (await loadRecord(env, g.id, url.origin)) as DocData | null;
  if (!d) return null;
  const x = d.record;
  const agency = x.agency_full || x.agency;
  // Official summary unless it's a one-liner (AARO/NARA) and an AI summary exists;
  // no summary at all → build one from the record's facts.
  const ai = d.fullText?.aiSummary;
  // Boilerplate openings shared across a release (same first 100 chars) would give
  // many files one search snippet: keep only this file's own sentences, else the
  // AI summary, else the facts line below.
  const { results: sib } = (x.summary?.length ?? 0) >= 100
    ? await env.DB.prepare("SELECT summary FROM records WHERE status='live' AND id<>? AND substr(summary,1,100)=substr(?,1,100) LIMIT 50")
        .bind(x.id, x.summary).all<{ summary: string }>()
    : { results: [] };
  const own = sib.length ? distinctSummary(x.summary!, sib.map((r) => r.summary)) : x.summary;
  const base = ((ai && (own ?? "").length < 80 ? ai : own) || "").trim();
  // Under ~100 chars (AARO videos with no summary, one-line image captions): add a
  // sentence from the facts so the search snippet says what and where the file is.
  const what = { pdf: "document", video: "video", image: "image" }[x.kind] ?? "file";
  const verb = { pdf: "Read the original document", video: "Watch the original footage", image: "View the full-resolution image" }[x.kind] ?? "Open the original file";
  const when = [x.incident_date, x.location].filter((v) => v && v !== "N/A").join(", ");
  const title = docTitle(x.title, x.id, x.kind);
  // Full title (with the id) when there's no summary: same-titled videos stay apart.
  const lead = `Declassified UAP ${what}${agency ? ` from ${agency}` : ""}${base ? "" : `: ${title}`}${when ? ` (${when})` : ""}.`;
  const description = base.length >= 100 ? base : [base && (/[.!?]$/.test(base) ? base : base + "."), lead, `${verb} on RealUFO.`].filter(Boolean).join(" ");
  // Same pick as thumbSql, from the assets already loaded.
  const thumb =
    d.assets.find((a) => a.role === "thumb") ?? d.assets.find((a) => a.role === "full" && a.mime?.startsWith("image/"));
  const full = d.assets.find((a) => a.role === "full");
  const dur = full?.duration;
  // Official key moments → Clips, so search can deep-link into the video (?t=
  // seeks). AI moments stay on the page, where they carry their disclaimer.
  const km = docMoments(d);
  const moments = km.ai ? [] : km.moments;
  const clips = moments.map((m, i) => {
    const end = m.end ?? moments[i + 1]?.start ?? dur;
    return {
      "@type": "Clip", name: m.text, startOffset: Math.floor(m.start),
      endOffset: end && end > m.start ? Math.ceil(end) : undefined,
      url: `${url.origin}${docHref(x.id)}?t=${Math.floor(m.start)}`,
    };
  });
  // Video/image types make the file eligible for video and image search results.
  const media =
    x.kind === "video" && full
      ? {
          "@type": "VideoObject", thumbnailUrl: thumb?.cdn_url, contentUrl: full.cdn_url,
          // Required by Google; AARO has no release date, so fall back to when we added it.
          uploadDate: isoDate(x.doc_date) || x.created_at?.slice(0, 10),
          duration: dur ? `PT${Math.floor(dur / 60)}M${Math.floor(dur % 60)}S` : undefined,
          hasPart: clips.length ? clips : undefined,
        }
      : x.kind === "image" && full
        ? { "@type": "ImageObject", contentUrl: full.cdn_url, thumbnailUrl: thumb?.cdn_url, creditText: agency || undefined }
        : { "@type": "DigitalDocument" };
  return {
    meta: {
      title, description, image: thumb?.cdn_url ?? null, ogImage: d.tldr?.cardUrl ?? null,
      ogDescription: d.tldr ? `${d.tldr.oneLiner} — ${d.tldr.bullets[0]}` : undefined,
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

const casePage: Loader = async (env, g, url) => {
  const [x, thread, others, story] = await Promise.all([
    env.DB.prepare("SELECT slug,name,lede,pull,pull_cite,coord,archive_label FROM cases WHERE slug=?")
      .bind(g.slug)
      .first<{ slug: string; name: string; lede: string | null; pull: string | null; pull_cite: string | null; coord: string | null; archive_label: string | null }>(),
    env.DB.prepare("SELECT id,title FROM threads WHERE case_slug=? LIMIT 1").bind(g.slug).first<{ id: string; title: string }>(),
    env.DB.prepare("SELECT slug,name FROM cases WHERE slug<>? ORDER BY name").bind(g.slug).all<{ slug: string; name: string }>(),
    storyView(env, g.slug),
  ]);
  if (!x) return null;
  const description = (x.lede || "").slice(0, 200);
  const title = story?.title ?? x.name;
  return {
    meta: {
      title, description,
      jsonLd: {
        "@type": "Article", headline: title, description, about: x.name,
        ...(story ? { dateModified: story.updated, citation: story.sources.flatMap((s) => (s.href ? [s.external ? s.href : `${url.origin}${s.href}`] : [])) } : {}),
      },
    },
    body: caseBody({ ...x, thread, others: others.results, story }),
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
    const page = pageOf(url);
    const h = await loadHub(env, kind, g.slug, url.origin, page);
    if (!h) return null;
    const offset = (h.page - 1) * h.pageSize;
    return {
      meta: {
        title: h.page > 1 ? `${h.title} — page ${h.page}` : h.title,
        description: h.topic
          ? `${firstSentence(h.topic.background)} ${h.intro}`.trim()
          : h.release ? `${h.intro} Agencies: ${agencyList(h.release.info, 3)}.` : h.intro,
        image: (h.records.find((r) => r.thumb)?.thumb as string | undefined) ?? null,
        type: "website",
        jsonLd: {
          "@type": "CollectionPage",
          name: h.title,
          description: h.intro,
          ...(h.topic ? { about: { "@type": "Thing", name: TOPIC_RULES.find((t) => t.slug === h.slug)?.label ?? h.title } } : {}),
          mainEntity: {
            "@type": "ItemList",
            numberOfItems: h.total,
            itemListElement: h.records.map((r, i) => ({ "@type": "ListItem", position: offset + i + 1, url: `${url.origin}${docHref(r.id)}`, name: docTitle(r.title, r.id, r.kind) })),
          },
        },
        breadcrumbs: [
          { name: "Home", href: "/" },
          { name: "Browse", href: "/browse" },
          { name: h.title, href: hubHref(kind, h.slug) },
        ],
        faq: h.release?.faq,
      },
      body: hubBody(h),
      // Paginated pages canonicalise to themselves (?page=N); page 1 keeps the bare path.
      ...(h.page > 1 ? { canonicalPath: `${hubHref(kind, h.slug)}?page=${h.page}` } : {}),
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

const releasesPage: Loader = async (env, _g, url) => {
  const meta = { title: RELEASES_TITLE, description: RELEASES_DESCRIPTION, type: "website" as const };
  let d;
  try {
    d = await trackerData(env, url.origin);
  } catch (e) {
    console.error("release tracker failed", e);
    return { meta, body: tabBody(RELEASES_TITLE, RELEASES_DESCRIPTION), noStore: true };
  }
  const last = d.series[d.series.length - 1];
  return {
    meta: {
      ...meta,
      description: last
        ? `${d.series.length} Pentagon UFO file releases so far (${d.series.reduce((n, r) => n + r.files, 0)} files), the latest on ${last.weekday} ${longDate(last.date)}. ${d.status.headline}`
        : RELEASES_DESCRIPTION,
      jsonLd: {
        "@type": "CollectionPage",
        name: RELEASES_TITLE,
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: d.series.length,
          itemListElement: d.series.map((r, i) => ({
            "@type": "ListItem", position: i + 1, url: `${url.origin}${hubHref("release", String(r.no))}`, name: `Release ${String(r.no).padStart(2, "0")}`,
          })),
        },
      },
      faq: d.faq,
      breadcrumbs: [
        { name: "Home", href: "/" },
        { name: "Browse", href: "/browse" },
        { name: "Release tracker", href: "/releases" },
      ],
    },
    body: releasesBody(d),
  };
};

const privacyPage: Loader = async () => ({
  meta: { title: "Privacy", description: "What RealUFO stores: a hashed anonymous browser id, hashed IPs for rate limits, and what you choose to post.", type: "website" },
  body: `<h1>Privacy</h1>${PRIVACY_HTML}`,
});

const termsPage: Loader = async () => ({
  meta: { title: "Terms", description: "Terms of use for RealUFO, an independent archive of declassified, public-domain UAP records.", type: "website" },
  body: `<h1>Terms</h1>${TERMS_HTML}`,
});

const notificationsPage: Loader = async () => ({
  meta: { title: "Notifications", description: "Choose which RealUFO updates reach this device.", type: "website", robots: "noindex" },
  body: "<h1>Notifications</h1>",
});

const developersPage: Loader = async () => ({
  meta: { title: "Developers", description: "RealUFO Public API v1: read-only, keyless JSON API for the declassified UAP archive — plus webhooks, SDKs and embed badges.", type: "website" },
  body: "<h1>Developers</h1>",
});

const comparePage: Loader = async () => ({
  meta: { title: "Compare", description: "Two RealUFO records side by side — spot redactions, renames and new summaries between releases.", type: "website", robots: "noindex" },
  body: "<h1>Compare</h1>",
});

// /shelf is in sitemap.xml, so it must pre-render (not 404+noindex) — and the
// crawler gets the real book list, not just the SPA shell.
const escAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const shelfPage: Loader = async () => ({
  meta: { title: "Reading Shelf", description: "Twelve books the researchers behind these declassified UAP files actually read — RealUFO's recommended reading shelf.", type: "website" },
  body: `<h1>Reading Shelf</h1><p>Twelve books the researchers behind these files actually read — each one picked because it illuminates something in the archive.</p><ul>${ALL_PICKS.map((p) => `<li><a href="${escAttr(affiliateUrl(p))}" rel="sponsored nofollow">${escAttr(p.title)}</a> — ${escAttr(p.creator)}</li>`).join("")}</ul>`,
});

// /newsletter is in sitemap.xml, so it must pre-render (not 404+noindex) — and the
// crawler gets the real issue list, not just the SPA shell.
const newsletterPage: Loader = async (env) => {
  let rows: { week: string; slug: string; sent_at: string }[] = [];
  try {
    const r = await env.DB.prepare("SELECT week, slug, sent_at FROM newsletter_issues ORDER BY week DESC LIMIT 60").all<{ week: string; slug: string; sent_at: string }>();
    rows = r.results ?? [];
  } catch { /* table may not exist yet */ }
  const items = rows.map((x) => {
    const title = CASE_STORY_TEXT[x.slug]?.title ?? x.slug;
    return `<li><a href="/case/${escAttr(x.slug)}">${escAttr(title)}</a> <span>— ${escAttr(x.sent_at.slice(0, 10))}</span></li>`;
  }).join("");
  const list = items || "<li>No issues sent yet — the first case file goes out this Friday.</li>";
  return {
    meta: { title: "Newsletter archive", description: "Every weekly declassified UFO case file from the RealUFO newsletter — one researched case per week, every claim cited.", type: "website" },
    body: `<h1>Newsletter archive</h1><p>One declassified UFO case file every Friday. Past issues, newest first:</p><ul>${list}</ul><p><a href="/notifications">Get the next one by email →</a></p>`,
  };
};

// /podcast is in sitemap.xml, so it must pre-render (not 404+noindex) — and the
// crawler gets the real episode list, not just the SPA shell.
const podcastPage: Loader = async (env) => {
  const { fetchPodcastEpisodes, PODCAST_FEED_URL } = await import("../routes/podcast");
  let eps: { title: string; description: string; pubDate: string; audioUrl: string; durationSecs: number; caseSlug: string }[] = [];
  try {
    eps = await fetchPodcastEpisodes();
  } catch { /* feed unreachable — render the shell */ }
  const fmtDur = (s: number) => (s > 0 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : "");
  const items = eps.map((e) => {
    const mins = fmtDur(e.durationSecs);
    const caseLink = e.caseSlug ? ` <a href="/case/${escAttr(e.caseSlug)}">Read the case file →</a>` : "";
    return `<li><strong>${escAttr(e.title)}</strong> <span>— ${escAttr(e.pubDate)}${mins ? ` · ${mins}` : ""}</span><br><span>${escAttr(e.description)}</span>${caseLink}<br><audio controls preload="none" src="${escAttr(e.audioUrl)}"></audio></li>`;
  }).join("");
  const list = items || "<li>No episodes yet — the first one drops with this Friday's case file.</li>";
  return {
    meta: { title: "Podcast — RealUFO Case Files", description: "RealUFO Case Files: one declassified UFO case file every week in audio — researched from the primary documents, every claim cited.", type: "website" },
    body: `<h1>RealUFO Case Files — the podcast</h1><p>One declassified UFO case file every week, in audio. Same case as the Friday email — listen or read, your pick.</p><p>Subscribe: <a href="${PODCAST_FEED_URL}">RSS</a></p><ul>${list}</ul>`,
  };
};

// A Short is the doc's video cut 9:16: same page for crawlers, canonical = the doc.
const shortPage: Loader = async (env, g, url) => {
  const p = await docPage(env, g, url);
  return p && { ...p, canonicalPath: docHref(g.id) };
};

export const ROUTES: { pattern: URLPattern; load: Loader; cacheKey?: (url: URL) => string }[] = [
  { pattern: new URLPattern({ pathname: "/" }), load: homePage },
  { pattern: new URLPattern({ pathname: "/archive" }), load: archivePage },
  { pattern: new URLPattern({ pathname: "/boards" }), load: boardsPage },
  { pattern: new URLPattern({ pathname: "/map" }), load: mapPage },
  { pattern: new URLPattern({ pathname: "/map/:place" }), load: mapPlacePage },
  { pattern: new URLPattern({ pathname: "/timeline" }), load: timelinePage },
  { pattern: new URLPattern({ pathname: "/timeline/:year" }), load: timelineYearPage },
  { pattern: new URLPattern({ pathname: "/ask" }), load: askPage },
  { pattern: new URLPattern({ pathname: "/ask/:id" }), load: sharedAskPage },
  { pattern: new URLPattern({ pathname: "/browse" }), load: browsePage },
  { pattern: new URLPattern({ pathname: "/releases" }), load: releasesPage },
  { pattern: new URLPattern({ pathname: "/privacy" }), load: privacyPage },
  { pattern: new URLPattern({ pathname: "/terms" }), load: termsPage },
  { pattern: new URLPattern({ pathname: "/notifications" }), load: notificationsPage },
  { pattern: new URLPattern({ pathname: "/developers" }), load: developersPage },
  { pattern: new URLPattern({ pathname: "/compare" }), load: comparePage },
  { pattern: new URLPattern({ pathname: "/shelf" }), load: shelfPage },
  { pattern: new URLPattern({ pathname: "/leaderboard" }), load: leaderboardPage },
  { pattern: new URLPattern({ pathname: "/newsletter" }), load: newsletterPage },
  { pattern: new URLPattern({ pathname: "/podcast" }), load: podcastPage },
  { pattern: new URLPattern({ pathname: "/release/:slug" }), load: hubPage("release"), cacheKey: (url) => `page=${pageOf(url)}` },
  { pattern: new URLPattern({ pathname: "/topic/:slug" }), load: hubPage("topic"), cacheKey: (url) => `page=${pageOf(url)}` },
  { pattern: new URLPattern({ pathname: "/agency/:slug" }), load: hubPage("agency"), cacheKey: (url) => `page=${pageOf(url)}` },
  { pattern: new URLPattern({ pathname: "/location/:slug" }), load: hubPage("location"), cacheKey: (url) => `page=${pageOf(url)}` },
  { pattern: new URLPattern({ pathname: "/decade/:slug" }), load: hubPage("decade"), cacheKey: (url) => `page=${pageOf(url)}` },
  { pattern: new URLPattern({ pathname: "/doc/:id" }), load: docPage },
  { pattern: new URLPattern({ pathname: "/shorts/:id" }), load: shortPage },
  { pattern: new URLPattern({ pathname: "/cases" }), load: casesPage },
  { pattern: new URLPattern({ pathname: "/case/:slug" }), load: casePage },
  { pattern: new URLPattern({ pathname: "/thread/:id" }), load: threadPage },
  { pattern: new URLPattern({ pathname: "/board/:slug" }), load: boardPage },
];
