// Archive screen: search / filter / grid. Ported from
// realufo-handoff/RealUFO.dc.html lines 167-205 (the `showArchive` branch of
// `data-screenpad`): search input + "AI-RAG soon" chip, a horizontally
// scrolling archive-chip row (All + one per bootstrap archive), type chips
// (All/Docs/Video/Images), redaction + has-flag chips, removable pills for
// the active filters, a result-count line, the DocCard grid, and the
// "no records match" empty state.
//
// This component renders ONLY that screen content — AppShell (Task 14) owns
// the app frame, AppBar, and nav, and mounts this inside its `<Outlet/>`
// (itself inside `data-screenpad`); the router wires `/archive` -> Archive
// (router.tsx).
//
// Filters are modeled as URL search params (`q`, `archive`, `type`,
// `redacted` (1|0), `has` (comma list), `sort`, plus `release`/`agency`/`decade`/`location` whose options come
// from useFacets(); recordsFilter() maps them to useRecords params) via react-router's `useSearchParams`, so a filtered view is
// shareable/back-button-friendly (the task brief's explicit requirement).
// All four are read fresh from the URL on every render EXCEPT the search
// box's own text, which needs a faster local echo than the ~250ms debounce
// applied before writing to the `q` param — typing straight into the query
// param would fire a fetch on every keystroke. `setParam`/the debounce
// effect both use `setSearchParams`'s functional-updater form (merging into
// whatever `prev` is, not a stale closed-over snapshot) with `{replace:
// true}` so filtering doesn't spam a history entry per keystroke/chip click.
//
// Data: useBootstrap() for the archive chip row (id/flag/label/count/accent);
// useRecords({q,archive,type,redacted}) for the grid + result count. Both
// default to []/0 while a query hasn't resolved (or errored) so nothing here
// ever indexes into `undefined`. The result-count/grid/empty-state block
// swaps to a small "◉ loading signal…" line while useRecords()'s *initial*
// fetch is in flight (`isLoading` — true only before the first settle, same
// convention as Feed.tsx) so a filter change never flashes an empty state.
//
// Pagination: a 1-based `page` URL param -> useRecords({limit, offset}),
// RECORDS_PAGE_SIZE matching the Worker's default limit. Any filter change drops
// `page` (back to 1). Page clicks push a history entry (unlike filters) so
// back steps through pages, and scroll the shell's `[data-scroll]` main back
// to the top. useRecords keeps the previous page on screen while the next
// one loads (dimmed) instead of flashing the loading line. DocCards carry
// the whole query string (filters + page) to /doc so its swipe list is this
// exact page (Doc.tsx crosses into neighbour pages at the edges).
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, FormEvent, ReactNode } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useBootstrap, useFacets, useHubs, useRecords, useShorts } from "../api/queries";
import { hubForFilters } from "../lib/hubLink";
import { useSetFooterLinks } from "../lib/footerLinks";
import { DocCard } from "../components/DocCard";
import { LoadError } from "../components/LoadError";
import { ShortsRow, shortHref } from "../components/ShortsRow";
import { useSetPageTitle } from "../lib/pageTitle";
import { RECORDS_PAGE_SIZE, recordsFilter, recordsPage } from "../lib/recordsPage";

const SEARCH_DEBOUNCE_MS = 250;

// First, last, and current±1, with "…" for each skipped run:
// (5, 20) -> [1, "…", 4, 5, 6, "…", 20].
export function pageList(page: number, total: number): (number | "…")[] {
  const out: (number | "…")[] = [];
  for (let p = 1; p <= total; p++) {
    if (p === 1 || p === total || Math.abs(p - page) <= 1) out.push(p);
    else if (out[out.length - 1] !== "…") out.push("…");
  }
  return out;
}

interface PagerProps {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
}

function Pager({ page, totalPages, onPage }: PagerProps) {
  const btn = "min-w-[30px] rounded-lg px-[9px] py-[5px] font-mono text-[11px] active:scale-[.96] disabled:opacity-35 disabled:active:scale-100";
  return (
    <nav aria-label="Pagination" className="mt-5 flex flex-wrap items-center justify-center gap-1.5">
      <button type="button" className={btn} style={typeChipStyle(false)} disabled={page <= 1} onClick={() => onPage(page - 1)}>
        ‹ prev
      </button>
      {pageList(page, totalPages).map((p, i) =>
        p === "…" ? (
          <span key={`gap${i}`} className="px-1 font-mono text-[11px] text-faint">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            className={btn}
            style={typeChipStyle(p === page)}
            aria-current={p === page ? "page" : undefined}
            onClick={() => onPage(p)}
          >
            {p}
          </button>
        ),
      )}
      <button type="button" className={btn} style={typeChipStyle(false)} disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
        next ›
      </button>
    </nav>
  );
}

// Jump-to-page box: native number input, Enter or "go" submits; out-of-range
// values clamp to 1..totalPages. Uncontrolled + keyed on `page` so it resets
// to the current page after every navigation.
function PageJump({ page, totalPages, onPage }: PagerProps) {
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const n = Math.floor(Number(new FormData(e.currentTarget).get("page")));
    if (!n) return;
    const target = Math.min(totalPages, Math.max(1, n));
    if (target !== page) onPage(target);
  }
  return (
    <form key={page} onSubmit={handleSubmit} className="mt-2.5 flex items-center justify-center gap-1.5 font-mono text-[11px] text-faint">
      <label htmlFor="archive-page-jump">jump to</label>
      <input
        id="archive-page-jump"
        name="page"
        type="number"
        inputMode="numeric"
        min={1}
        max={totalPages}
        defaultValue={page}
        className="w-[64px] rounded-lg border border-line2 bg-surface px-2 py-[5px] text-center text-[11px] text-ink outline-none focus:border-signal"
      />
      <span>/ {totalPages}</span>
      <button type="submit" className="rounded-lg px-[9px] py-[5px] text-[11px] active:scale-[.96]" style={typeChipStyle(false)}>
        go
      </button>
    </form>
  );
}

// "label first segment": bootstrap archive labels pack a short code and a
// longer aside separated by " · " (e.g. "NARA · Blue Book", "UK · National
// Archives", "War.gov · PURSUE") — the chip only has room for the short
// code, so split on the middle dot and keep the first segment; labels with
// no "·" (e.g. "AARO", "NASA UAP") pass through unchanged.
function chipLabel(label: string): string {
  return label.split("·")[0].trim();
}

// Brief's literal formula/example: count>999 ? round(count/1000)+'k' :
// count — e.g. the "NARA · Blue Book" seed archive's 12618 -> "13k".
function abbreviateCount(count: number): string {
  if (count > 999) return `${Math.round(count / 1000)}k`;
  return String(count);
}

// Archive-chip styling — ported verbatim from the prototype's `archChips`
// `.map()` (RealUFO.dc.html:592):
//   `on = s.fArch===c.id`;
//   color:  on ? (c.id==='all' ? 'var(--signal)' : '#fff') : 'var(--dim)'
//   bg:     on ? (archMap[c.id] ? archMap[c.id].accent : 'var(--signal-dim)') : 'transparent'
//   border: on ? 'transparent' : 'var(--line2)'
// i.e. a selected *specific* archive chip is a SOLID fill of that archive's
// own accent color with white text (not an accent-tinted translucent chip);
// the "All" chip (no accent of its own) falls back to var(--signal-dim)/
// var(--signal) instead, same as the generic nav-active treatment.
function archiveChipStyle(selected: boolean, isAll: boolean, accent?: string): CSSProperties {
  if (!selected) {
    return { border: "1px solid var(--line2)", background: "transparent", color: "var(--dim)" };
  }
  return {
    border: "1px solid transparent",
    background: isAll ? "var(--signal-dim)" : (accent ?? "var(--signal-dim)"),
    color: isAll ? "var(--signal)" : "#fff",
  };
}

// Type-chip styling — ported verbatim from the prototype's `typeChips`
// `.map()` (RealUFO.dc.html:594): distinct from archive chips — a selected
// type chip keeps the var(--signal) OUTLINE (not transparent) plus the
// var(--signal-dim) fill, it never solid-fills.
function typeChipStyle(selected: boolean): CSSProperties {
  return selected
    ? { border: "1px solid var(--signal)", background: "var(--signal-dim)", color: "var(--signal)" }
    : { border: "1px solid var(--line2)", background: "transparent", color: "var(--dim)" };
}

interface ChipProps {
  selected: boolean;
  style: CSSProperties;
  onClick: () => void;
  children: ReactNode;
}

// Archive-chip button chrome — prototype line 176: `padding:7px 11px;
// border-radius:9px; font-size:11px; gap:6px`.
function ArchiveChip({ selected, style, onClick, children }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="flex flex-none items-center gap-1.5 whitespace-nowrap rounded-[9px] px-[11px] py-[7px] font-mono text-[11px] active:scale-[.96]"
      style={style}
    >
      {children}
    </button>
  );
}

// Type-chip button chrome — prototype line 182: `padding:5px 10px;
// border-radius:8px; font-size:10.5px` (no icon/gap — label text only).
function TypeChip({ selected, style, onClick, children }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="whitespace-nowrap rounded-lg px-[10px] py-[5px] font-mono text-[10.5px] active:scale-[.96]"
      style={style}
    >
      {children}
    </button>
  );
}

// Native select for one facet; "" = no filter.
function FacetSelect({ label, value, all, options, onChange }: {
  label: string;
  value: string;
  all: string;
  options: { value: string; label: string }[];
  onChange: (value: string | null) => void;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value || null)}
      className="min-w-0 flex-1 rounded-lg border bg-surface px-2 py-[5px] font-mono text-[10.5px] outline-none focus:border-signal"
      style={{ borderColor: value ? "var(--signal)" : "var(--line2)", color: value ? "var(--signal)" : "var(--dim)" }}
    >
      <option value="">{all}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

const FILTER_KEYS = ["q", "archive", "type", "redacted", "has", "release", "agency", "decade", "location"];
const TYPE_LABELS: Record<string, string> = { pdf: "Docs", video: "Video", image: "Images" };
// `has=` flags, in the order they're written to the URL.
const HAS_FLAGS = [
  ["ai", "AI summary"],
  ["text", "Full text"],
  ["moments", "Video moments"],
  ["featured", "Featured"],
] as const;
const SORTS = [
  { value: "new", label: "Newest added" },
  { value: "old", label: "Oldest incident" },
  { value: "recent", label: "Newest incident" },
  { value: "release", label: "Newest release" },
  { value: "az", label: "Title A–Z" },
];

export function Archive() {
  const { data: boot } = useBootstrap();
  const totalRecords = boot?.stats?.records;
  const totalSources = boot?.stats?.archives;
  // AppBar title — prototype's `titles.archive` (RealUFO.dc.html:566), with
  // REAL counts (no fake fillups).
  useSetPageTitle(
    "THE ARCHIVE",
    totalRecords != null ? `${totalRecords.toLocaleString()} records · ${totalSources ?? 0} sources` : "Declassified records",
  );

  const [searchParams, setSearchParams] = useSearchParams();

  const filter = recordsFilter(searchParams);
  // RecordsParams.location may be a list (map places, b2cfba0); the Archive select is single.
  const location = [filter.location ?? []].flat()[0] ?? "";
  const q = filter.q ?? "";
  const archive = filter.archive ?? "";
  const type = filter.type ?? "";
  const redacted = filter.redacted ?? "";
  const has = (filter.has ?? "").split(",").filter(Boolean);
  const hasParam = (next: string[]) => HAS_FLAGS.map(([k]) => k).filter((k) => next.includes(k)).join(",") || null;
  const release = filter.release ?? "";
  const { data: facets } = useFacets();
  // One active tag filter that belongs to a hub → offer its landing page.
  const { data: hubsData } = useHubs();
  const tagHub = hubForFilters(
    { release: filter.release, agency: filter.agency, location: location || undefined, decade: filter.decade },
    hubsData?.hubs ?? []
  );
  useSetFooterLinks(tagHub && { title: "This filter", links: [{ to: `/${tagHub.kind}/${tagHub.slug}`, text: `${tagHub.label} page` }] });
  // Releases are war.gov-only, so the chips only show for All / War.gov.
  const showReleases = !!facets?.releases.length && (archive === "" || archive === "wargov");
  const page = recordsPage(searchParams);

  // Ask moved to its own tab: old /archive?ask= links land on /ask?q=. With
  // the flag off they fall back to keyword search (the ask param is ignored).
  const legacyAsk = boot?.features?.ask ? searchParams.get("ask") : null;
  const rootRef = useRef<HTMLDivElement>(null);

  // Local echo of the search box so every keystroke feels instant; only the
  // debounced value below is ever written to the `q` param / handed to
  // useRecords.
  const [inputValue, setInputValue] = useState(q);

  // Keep the input in sync when `q` changes from elsewhere (back/forward
  // nav, a shared link, another chip clearing filters) without fighting the
  // user's own typing.
  useEffect(() => {
    setInputValue(q);
  }, [q]);

  // Debounce: ~250ms after the user stops typing, push the value to the `q`
  // param (skipped entirely if it already matches, e.g. the sync above just
  // echoed it back).
  useEffect(() => {
    if (inputValue === q) return;
    const handle = setTimeout(() => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (inputValue) next.set("q", inputValue);
          else next.delete("q");
          next.delete("page");
          return next;
        },
        { replace: true },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
    // `q` deliberately excluded — this effect only reacts to the user's own
    // typing (`inputValue`); reacting to `q` too would re-fire the same
    // write it just caused.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue]);

  function setParams(updates: Record<string, string | null>) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(updates)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        next.delete("page");
        return next;
      },
      { replace: true },
    );
  }

  const setParam = (key: string, value: string | null) => setParams({ [key]: value });

  function goToPage(p: number) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (p > 1) next.set("page", String(p));
      else next.delete("page");
      return next;
    });
    rootRef.current?.closest("[data-scroll]")?.scrollTo?.({ top: 0 });
  }

  const archives = boot?.archives ?? [];
  const flags = facets?.flags;
  const kindCount = (k: string) => facets?.kinds?.find((x) => x.name === k)?.count;

  // One removable pill per active filter, in the order the controls appear.
  type Pill = { label: string; remove: Record<string, string | null> };
  const pills = ([
    q && { label: `“${q}”`, remove: { q: null } },
    archive && { label: chipLabel(archives.find((a) => a.id === archive)?.label ?? archive), remove: { archive: null, release: null } },
    release && { label: `R${release.padStart(2, "0")}`, remove: { release: null } },
    filter.agency && { label: filter.agency, remove: { agency: null } },
    filter.decade && { label: `${filter.decade}s`, remove: { decade: null } },
    location && { label: location, remove: { location: null } },
    type && { label: TYPE_LABELS[type] ?? type, remove: { type: null } },
    redacted && { label: redacted === "1" ? "Redacted" : "Unredacted", remove: { redacted: null } },
    ...HAS_FLAGS.filter(([k]) => has.includes(k)).map(([k, label]) => ({ label, remove: { has: hasParam(has.filter((h) => h !== k)) } })),
  ] as (Pill | "" | undefined)[]).filter((p): p is Pill => !!p);

  const { data, isLoading, isError, error, refetch, isPlaceholderData } = useRecords(
    {
      ...filter,
      limit: RECORDS_PAGE_SIZE,
      offset: (page - 1) * RECORDS_PAGE_SIZE,
    },
    { keepPrevious: true },
  );
  // Searching: matching Shorts (title/summary/page text or the posted Short's
  // text) as a strip above the files; tap → the player, queue = this search.
  const { data: shorts = [], hasNextPage: moreShorts } = useShorts(q, { enabled: !!q });
  const records = data?.records ?? [];
  const count = data?.count ?? 0;
  const totalPages = Math.ceil(count / RECORDS_PAGE_SIZE);

  if (legacyAsk) return <Navigate to={`/ask?q=${encodeURIComponent(legacyAsk)}`} replace />;

  return (
    <div ref={rootRef} data-screen="archive" className="animate-[fadeup_.35s_ease_both]">
      {/* search bar — lines 169-173 */}
      <form
        onSubmit={(e) => e.preventDefault()}
        className="mb-3.5 flex items-center gap-[9px] rounded-xl border border-line2 bg-surface px-[13px] py-2.5"
      >
        <span aria-hidden="true" className="text-[15px] text-faint">
          ⌕
        </span>
        <input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          enterKeyHint="search"
          placeholder={
            totalRecords != null
              ? `search ${totalRecords.toLocaleString()} records — titles, places, words inside the files…`
              : "search the archive — titles, places, words inside the files…"
          }
          className="min-w-0 flex-1 border-0 bg-transparent font-mono text-[12.5px] text-ink outline-none placeholder:text-faint"
        />
      </form>

      {/* archive chip row — lines 174-178 */}
      <div data-scroll className="mb-1.5 flex gap-[7px] overflow-x-auto pb-2.5">
        <ArchiveChip selected={archive === ""} style={archiveChipStyle(archive === "", true)} onClick={() => setParam("archive", null)}>
          {/* prototype archChips seeds the "all" entry with flag:'🛰' (RealUFO.dc.html:591) */}
          <span aria-hidden="true">🛰</span>
          All
        </ArchiveChip>
        {archives.map((a) => (
          <ArchiveChip
            key={a.id}
            selected={archive === a.id}
            style={archiveChipStyle(archive === a.id, false, a.accent)}
            onClick={() => setParams({ archive: a.id, ...(a.id === "wargov" ? {} : { release: null }) })}
          >
            <span aria-hidden="true">{a.flag}</span>
            {chipLabel(a.label)} <span className="opacity-60">{abbreviateCount(a.count)}</span>
          </ArchiveChip>
        ))}
      </div>

      {/* war.gov release chips */}
      {showReleases && (
        <div data-scroll className="mb-1.5 flex gap-1.5 overflow-x-auto pb-1.5">
          <TypeChip selected={release === ""} style={typeChipStyle(release === "")} onClick={() => setParam("release", null)}>
            All releases
          </TypeChip>
          {facets!.releases.map((r) => {
            const on = release === String(r.no);
            return (
              <span key={r.no} title={`war.gov release ${r.no} · ${r.date}`} className="flex-none">
                <TypeChip selected={on} style={typeChipStyle(on)} onClick={() => setParam("release", String(r.no))}>
                  R{String(r.no).padStart(2, "0")} <span className="opacity-60">{abbreviateCount(r.count)}</span>
                </TypeChip>
              </span>
            );
          })}
        </div>
      )}

      {/* agency / decade / location */}
      <div className="mb-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        <FacetSelect
          label="Agency"
          all="All agencies"
          value={filter.agency ?? ""}
          options={(facets?.agencies ?? []).map((a) => ({ value: a.name, label: `${a.name} (${a.count})` }))}
          onChange={(v) => setParam("agency", v)}
        />
        <FacetSelect
          label="Decade"
          all="Any decade"
          value={filter.decade ?? ""}
          options={(facets?.decades ?? []).map((d) => ({ value: String(d.decade), label: `${d.decade}s (${d.count})` }))}
          onChange={(v) => setParam("decade", v)}
        />
        <FacetSelect
          label="Location"
          all="Any location"
          value={location}
          options={(facets?.locations ?? []).map((l) => ({ value: l.name, label: `${l.name} (${l.count})` }))}
          onChange={(v) => setParam("location", v)}
        />
        <FacetSelect label="Sort" all="Featured first" value={filter.sort ?? ""} options={SORTS} onChange={(v) => setParam("sort", v)} />
      </div>

      {/* type chips */}
      <div className="mb-1.5 px-0.5 py-1">
        <div className="flex gap-1.5">
          {["", ...Object.keys(TYPE_LABELS)].map((k) => {
            const n = k ? kindCount(k) : totalRecords;
            return (
              <TypeChip key={k} selected={type === k} style={typeChipStyle(type === k)} onClick={() => setParam("type", k || null)}>
                {TYPE_LABELS[k] ?? "All"} {n != null && <span className="opacity-60">{abbreviateCount(n)}</span>}
              </TypeChip>
            );
          })}
        </div>
      </div>

      {/* redaction (exclusive pair) + has-flags (combine) */}
      <div data-scroll className="mb-3 flex items-center gap-1.5 overflow-x-auto pb-1.5">
        {(
          [
            ["1", "Redacted", flags?.redacted],
            ["0", "Unredacted", flags?.unredacted],
          ] as const
        ).map(([v, label, n]) => (
          <TypeChip key={v} selected={redacted === v} style={typeChipStyle(redacted === v)} onClick={() => setParam("redacted", redacted === v ? null : v)}>
            {label} {n != null && <span className="opacity-60">{abbreviateCount(n)}</span>}
          </TypeChip>
        ))}
        <span aria-hidden="true" className="mx-0.5 h-4 w-px flex-none bg-line2" />
        {HAS_FLAGS.map(([k, label]) => {
          const on = has.includes(k);
          return (
            <TypeChip
              key={k}
              selected={on}
              style={typeChipStyle(on)}
              onClick={() => setParam("has", hasParam(on ? has.filter((h) => h !== k) : [...has, k]))}
            >
              {label} {flags && <span className="opacity-60">{abbreviateCount(flags[k])}</span>}
            </TypeChip>
          );
        })}
      </div>

      {pills.length > 0 && (
        <ul aria-label="Active filters" className="mx-0.5 mb-2.5 flex flex-wrap items-center gap-1.5">
          {pills.map((p) => (
            <li key={p.label}>
              <button
                type="button"
                aria-label={`Remove ${p.label}`}
                onClick={() => setParams(p.remove)}
                className="rounded-full border border-signal px-2 py-[3px] font-mono text-[10px] text-signal hover:bg-signal hover:text-bg"
              >
                {p.label} ✕
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => setParams(Object.fromEntries(FILTER_KEYS.map((k) => [k, null])))}
              className="px-1 font-mono text-[10.5px] text-dim hover:text-signal"
            >
              ✕ clear all
            </button>
          </li>
        </ul>
      )}

      {isLoading ? (
        <div className="font-mono text-[11px] text-faint">◉ loading signal…</div>
      ) : (
        <>
          {q && page === 1 && shorts.length > 0 && (
            <section aria-labelledby="archive-shorts" className="mb-[18px]">
              <h2 id="archive-shorts" className="mx-0.5 mb-3 font-pixel text-[9px] font-normal uppercase tracking-[1px] text-faint">
                ◆ Shorts ({shorts.length}{moreShorts ? "+" : ""})
              </h2>
              <ShortsRow shorts={shorts} href={(s) => shortHref(s, q)} />
            </section>
          )}

          {/* result count — line 187 */}
          <div className="mx-0.5 mb-3 font-mono text-[10px] uppercase tracking-[.8px] text-faint">
            <b className="text-signal">{count.toLocaleString()}</b> records
            {totalPages > 1 && ` · page ${page} / ${totalPages}`} · swipe a file to flip through
          </div>

          {/* grid — lines 188-203 */}
          <div
            data-grid
            className={`transition-opacity ${isPlaceholderData ? "opacity-50" : ""} grid grid-flow-row-dense grid-cols-2 gap-3 min-[900px]:grid-cols-[repeat(auto-fill,minmax(210px,1fr))]`}
          >
            {records.map((record) => (
              <DocCard key={record.id} record={record} variant="grid" search={searchParams.toString()} />
            ))}
          </div>

          {/* empty state — line 204 */}
          {isError && !data ? (
            <LoadError error={error} onRetry={() => void refetch()} />
          ) : (
            count === 0 && (
              <div className="px-5 py-[60px] text-center font-mono text-[12px] text-faint">
                no records match.
                <br />
                the truth is elsewhere.
              </div>
            )
          )}

          {totalPages > 1 && (
            <>
              <Pager page={page} totalPages={totalPages} onPage={goToPage} />
              <PageJump page={page} totalPages={totalPages} onPage={goToPage} />
            </>
          )}
        </>
      )}
    </div>
  );
}

export default Archive;
