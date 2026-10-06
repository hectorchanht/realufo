// /developers — public API v1 documentation for third-party developers.
// Read-only, keyless, CORS-open. Code samples are copy-pasteable curl.
import { useSetPageTitle } from "../lib/pageTitle";

const Code = ({ children }: { children: string }) => (
  <pre className="overflow-x-auto rounded border border-line bg-panel p-3 font-mono text-[12px] leading-[1.5] text-ink">
    <code>{children}</code>
  </pre>
);

const H2 = ({ children }: { children: React.ReactNode }) => (
  <h2 className="mb-2 mt-8 font-mono text-[11px] font-semibold uppercase tracking-[.5px] text-ink">{children}</h2>
);

const Endpoint = ({ method, path, desc }: { method: string; path: string; desc: string }) => (
  <li className="flex flex-wrap items-baseline gap-x-3 py-1.5">
    <span className="font-mono text-[11px] font-bold text-signal">{method}</span>
    <code className="font-mono text-[12px] text-ink">{path}</code>
    <span className="text-dim">{desc}</span>
  </li>
);

export default function Developers() {
  useSetPageTitle("DEVELOPERS", "", "Developers");
  return (
    <div data-screen="developers" style={{ animation: "fadeup .3s ease both" }}>
      <h1 className="mb-2 text-[19px] font-bold leading-[1.3] text-ink">Developers</h1>
      <p className="max-w-[680px] text-[14px] leading-[1.6] text-dim">
        The RealUFO Public API is a read-only JSON API over the whole archive — every declassified record, case story,
        release and hub the site renders. No API keys, no signup.{" "}
        <a className="text-signal hover:underline" href="/api/v1/openapi.json">OpenAPI spec</a>
      </p>

      <H2>Quickstart</H2>
      <Code>{`# search the archive
curl "https://realufo.org/api/v1/records?q=roswell&per_page=5"

# one record, full detail
curl "https://realufo.org/api/v1/records/DOW-UAP-PR057a"

# OCR full text of a record
curl "https://realufo.org/api/v1/records/DOW-UAP-PR057a/text"`}</Code>

      <H2>Envelope</H2>
      <p className="mb-2 max-w-[680px] text-[14px] leading-[1.6] text-dim">
        Every v1 response is <code className="font-mono text-[12px] text-ink">{"{ data, meta }"}</code>. List endpoints add{" "}
        <code className="font-mono text-[12px] text-ink">meta.total / meta.page / meta.per_page</code>. Errors are{" "}
        <code className="font-mono text-[12px] text-ink">{"{ error }"}</code> with the matching HTTP status.
        Documented fields are additive-only: new fields may appear, documented ones never change type or disappear.
      </p>

      <H2>Endpoints</H2>
      <ul className="max-w-[680px] divide-y divide-line text-[14px]">
        <Endpoint method="GET" path="/api/v1/records" desc="Search + filter. Params: q, archive, type, agency, location, year, decade, release, sort, has (text,ai,moments,featured), page, per_page (max 100)" />
        <Endpoint method="GET" path="/api/v1/records/:id" desc="Full detail: assets, release, series, related, AI summary, TL;DR, topics, hubs" />
        <Endpoint method="GET" path="/api/v1/records/:id/text" desc="OCR pages of a record" />
        <Endpoint method="GET" path="/api/v1/archives" desc="Filter facets: releases, kinds, agencies, decades, locations" />
        <Endpoint method="GET" path="/api/v1/releases" desc="war.gov release list with file counts" />
        <Endpoint method="GET" path="/api/v1/cases" desc="Case stories (slug + title)" />
        <Endpoint method="GET" path="/api/v1/cases/:slug" desc="One case story with resolved sources" />
        <Endpoint method="GET" path="/api/v1/shorts" desc="Short clips. Params: q, page, per_page" />
        <Endpoint method="GET" path="/api/v1/hubs" desc="Curated hubs: agency, location, release, decade, topic" />
        <Endpoint method="GET" path="/api/v1/hubs/:kind/:slug" desc="One hub with its records" />
      </ul>

      <H2>Example</H2>
      <Code>{`$ curl "https://realufo.org/api/v1/records?q=tictac&per_page=2" | head -c 400
{"data":[{"id":"DOW-UAP-PR086","archive":"wargov","agency":"DoD",
"title":"Nimitz Carrier Strike Group Encounter","kind":"video",
"incident_date":"2004-11-14","thumb":"https://assets.realufo.org/…",
…}],"meta":{"total":12,"page":1,"per_page":2}}`}</Code>

      <H2>Limits</H2>
      <p className="max-w-[680px] text-[14px] leading-[1.6] text-dim">
        600 requests per 60 seconds per IP (<code className="font-mono text-[12px] text-ink">429</code> +{" "}
        <code className="font-mono text-[12px] text-ink">Retry-After</code> past that). CORS is open (
        <code className="font-mono text-[12px] text-ink">Access-Control-Allow-Origin: *</code>), so browser apps can call
        it directly. List responses cache at the edge for 5 minutes; details for 10.
      </p>

      <H2>Webhooks</H2>
      <p className="mb-2 max-w-[680px] text-[14px] leading-[1.6] text-dim">
        Don’t poll — subscribe. RealUFO POSTs signed JSON to your URL when records appear (
        <code className="font-mono text-[12px] text-ink">records.created</code>) or a new war.gov release lands (
        <code className="font-mono text-[12px] text-ink">release.created</code>). Verify{" "}
        <code className="font-mono text-[12px] text-ink">X-RealUFO-Signature</code> (HMAC-SHA256 of the body with your
        secret). Manage a subscription with the secret from creation, sent as{" "}
        <code className="font-mono text-[12px] text-ink">X-Webhook-Secret</code>.
      </p>
      <Code>{`# subscribe
curl -X POST https://realufo.org/api/v1/webhooks \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://example.com/hook","events":["release.created"]}'
# → {"data":{"id":"wh_…","url":"…","events":["release.created"],"secret":"…"}}

# payload posted to your URL
{"event":"release.created","delivered_at":"…",
 "data":{"no":7,"date":"2026-09-30","file_count":42}}

# delete
curl -X DELETE https://realufo.org/api/v1/webhooks/wh_… \\
  -H "X-Webhook-Secret: …"`}</Code>

      <H2>Embed</H2>      <p className="mb-2 max-w-[680px] text-[14px] leading-[1.6] text-dim">
        Put the archive on your site: a live "latest release" badge that links back to realufo.org. Free distribution.
      </p>
      <Code>{`<iframe src="https://realufo.org/embed/badge"
  width="320" height="96" style="border:0"
  loading="lazy" title="Latest RealUFO release"></iframe>
<!-- ?theme=light for light pages -->`}</Code>

      <H2>SDKs</H2>
      <p className="mb-2 max-w-[680px] text-[14px] leading-[1.6] text-dim">
        Thin clients, zero dependencies. Source in the{" "}
        <a className="text-signal hover:underline" href="https://github.com/hectorchanht/realufo/tree/main/sdk">sdk/</a>{" "}
        directory of the repo (npm / PyPI publishing is on the way).
      </p>
      <Code>{`npm install realufo        # JavaScript / TypeScript
pip install realufo        # Python

import { RealUFO } from "realufo";
const { data } = await new RealUFO().records({ q: "tic tac" });

from realufo import RealUFO
page = RealUFO().records(q="tic tac")`}</Code>

      <H2>Terms</H2>
      <p className="max-w-[680px] text-[14px] leading-[1.6] text-dim">
        The records are declassified public documents; the archive mirrors official sources verbatim. If you re-present
        mirrored fields, keep their values exact — don't relabel an official value as a different one. AI summaries and
        TL;DRs are site-generated. Attribution to realufo.org is appreciated. Questions:{" "}
        <a className="text-signal hover:underline" href="mailto:hello@realufo.org">hello@realufo.org</a>.
      </p>
    </div>
  );
}
