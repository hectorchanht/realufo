// Plain-HTML pre-render of SPA routes, injected by meta.ts serveWithMeta into
// <div id="root">. React's createRoot clears it on mount, so this is what
// crawlers, share scrapers and the pre-JS moment see. It must say the same
// things the SPA shows on that URL. Every interpolated value goes through
// esc(): thread bodies and handles are anonymous user input.

// Same copy as the default block in web/index.html.
export const DEFAULT_DESCRIPTION =
  "Searchable archive of declassified UAP/UFO records from the Pentagon, CIA, FBI and NASA, with case files, a sighting map and anonymous discussion boards.";

export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type Link = { href: string; text: string };
export type RecordLink = { id: string; title: string };

export const docHref = (id: string) => `/doc/${encodeURIComponent(id)}`;
export const threadHref = (id: string) => `/thread/${encodeURIComponent(id)}`;
// boards.slug is slash-wrapped ("/uap/"); the URL uses the bare slug.
export const boardHref = (slug: string) => `/board/${encodeURIComponent(slug.replace(/^\/|\/$/g, ""))}`;

const a = (l: Link) => `<a href="${esc(l.href)}">${esc(l.text)}</a>`;
const ul = (items: Link[]) => `<ul>${items.map((l) => `<li>${a(l)}</li>`).join("")}</ul>`;
const paras = (text: string | null | undefined) =>
  (text || "")
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p)}</p>`)
    .join("");
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export const section = (heading: string, items: Link[]) =>
  items.length ? `<section><h2>${esc(heading)}</h2>${ul(items)}</section>` : "";
export const docLinks = (rs: RecordLink[]): Link[] => rs.map((r) => ({ href: docHref(r.id), text: r.title }));
export const countList = (heading: string, items: { name: string; count: number }[]) =>
  items.length
    ? `<section><h2>${esc(heading)}</h2><ul>${items.map((x) => `<li>${esc(x.name)} (${x.count})</li>`).join("")}</ul></section>`
    : "";

const NAV: Link[] = [
  { href: "/", text: "RealUFO" },
  { href: "/archive", text: "Archive" },
  { href: "/boards", text: "Boards" },
  { href: "/map", text: "Map" },
];
const STYLE =
  "<style>#root>.ssr{background:#07080c;color:#e6e6e6;font:16px/1.6 system-ui,sans-serif;max-width:860px;margin:0 auto;padding:24px 16px}" +
  "#root>.ssr a{color:#9ecbff}#root>.ssr dt{opacity:.7}#root>.ssr blockquote{border-left:3px solid #444;margin:1em 0;padding-left:1em}</style>";

// Fills the SPA's empty mount point. Function replacement: a string
// replacement would expand `$&`/`$'` patterns in user text.
export function injectBody(html: string, body: string): string {
  return html.replace(
    '<div id="root"></div>',
    () => `<div id="root">${STYLE}<div class="ssr"><nav>${NAV.map(a).join(" · ")}</nav><main>${body}</main></div></div>`
  );
}

export const tabBody = (title: string, intro: string, ...sections: string[]) =>
  `<h1>${esc(title)}</h1>${paras(intro)}${sections.join("")}`;

export const homeBody = (latest: RecordLink[]) =>
  tabBody("RealUFO — Declassified UAP Archive", DEFAULT_DESCRIPTION, section("Latest files", docLinks(latest)));

export type DocData = {
  record: {
    id: string; title: string; summary: string | null; agency: string | null; agency_full: string | null;
    incident_date: string | null; location: string | null; doc_date: string | null; kind: string;
  };
  assets: { role: string; cdn_url: string; mime: string | null; duration?: number | null }[];
  promotedThreads: { id: string; title: string }[];
  series: { prev: string | null; next: string | null };
  release: { no: number; date: string } | null;
  related: { key: string; label: string; records: RecordLink[] }[];
};

const RELATED_HEADING: Record<string, string> = {
  location: "Same location", period: "Same period", release: "Same release", agency: "Same agency",
};

export function docBody(d: DocData): string {
  const r = d.record;
  const dur = d.assets.find((x) => x.role === "full" && x.duration)?.duration;
  const facts: [string, string | null | undefined][] = [
    ["File", r.id],
    ["Agency", r.agency_full || r.agency],
    ["Incident date", r.incident_date],
    ["Location", r.location && r.location !== "N/A" ? r.location : null],
    ["Released in", d.release && `Release ${String(d.release.no).padStart(2, "0")} (${d.release.date})`],
    ["File type", r.kind.toUpperCase()],
    ["Length", dur ? mmss(dur) : null],
  ];
  const series = [
    d.series.prev && a({ href: docHref(d.series.prev), text: `Previous: ${d.series.prev}` }),
    d.series.next && a({ href: docHref(d.series.next), text: `Next: ${d.series.next}` }),
  ].filter(Boolean);
  return [
    `<p>${a({ href: "/", text: "Home" })} › ${a({ href: "/archive", text: "Archive" })}${r.agency ? ` › ${esc(r.agency)}` : ""}</p>`,
    `<h1>${esc(r.title)}</h1>`,
    `<dl>${facts.filter(([, v]) => v).map(([k, v]) => `<dt>${k}</dt><dd>${esc(String(v))}</dd>`).join("")}</dl>`,
    paras(r.summary),
    `<p>${a({ href: `/api/file/${encodeURIComponent(r.id)}`, text: "Open original file" })}</p>`,
    series.length ? `<p>${series.join(" · ")}</p>` : "",
    ...d.related.map((g) => section(`${RELATED_HEADING[g.key] ?? "Related"}: ${g.label}`, docLinks(g.records))),
    section("Discussion", d.promotedThreads.map((t) => ({ href: threadHref(t.id), text: t.title }))),
  ].join("");
}

export type ThreadData = {
  title: string; boardSlug: string | null; boardName: string | null; sourceRecordId: string | null;
  opBody: string | null; opHandle: string | null;
  replies: { handle: string | null; body: string | null }[];
};

export function threadBody(t: ThreadData): string {
  const post = (handle: string | null, body: string | null) =>
    `<article><p><b>${esc(handle || "Anonymous")}</b></p>${paras(body)}</article>`;
  return [
    t.boardSlug ? `<p>${a({ href: boardHref(t.boardSlug), text: t.boardName || t.boardSlug })}</p>` : "",
    `<h1>${esc(t.title)}</h1>`,
    t.sourceRecordId ? `<p>${a({ href: docHref(t.sourceRecordId), text: `File ${t.sourceRecordId}` })}</p>` : "",
    post(t.opHandle, t.opBody),
    ...t.replies.map((p) => post(p.handle, p.body)),
  ].join("");
}

export const boardBody = (b: { name: string; desc: string | null; threads: { id: string; title: string }[] }) =>
  tabBody(b.name, b.desc || "", section("Threads", b.threads.map((t) => ({ href: threadHref(t.id), text: t.title }))));

export function caseBody(c: {
  name: string; lede: string | null; pull: string | null; pull_cite: string | null; thread: { id: string; title: string } | null;
}): string {
  const quote = c.pull ? `<blockquote>${paras(c.pull)}${c.pull_cite ? `<cite>${esc(c.pull_cite)}</cite>` : ""}</blockquote>` : "";
  const discussion = c.thread ? section("Discussion", [{ href: threadHref(c.thread.id), text: c.thread.title }]) : "";
  return tabBody(c.name, c.lede || "", quote, discussion);
}
