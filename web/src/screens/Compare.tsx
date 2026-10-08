// /compare?a=<id>&b=<id> — side-by-side record comparison, for spotting what
// changed between releases (redactions, renames, new summaries). Differing
// values are highlighted; each column links back to its doc page.
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeftRight, X, ChevronLeft, ChevronRight } from "lucide-react";
import { useRecord, useRecords } from "../api/queries";
import { useSetPageTitle } from "../lib/pageTitle";
import { Skeleton } from "../components/Skeleton";
import type { RecordDetail } from "../api/types";

function Picker({ label, value, onPick }: { label: string; value: string; onPick: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const { data } = useRecords({ q, limit: 6 }, { enabled: open && q.trim().length > 1 });
  const hits = data?.records ?? [];
  return (
    <div className="relative min-w-0 flex-1">
      <div className="mb-1 font-mono text-[10px] uppercase tracking-[.5px] text-faint">{label}</div>
      <div className="flex items-center gap-2">
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={value || "Search records…"}
          aria-label={`${label} record search`}
          className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2.5 text-[14px] text-ink placeholder:text-faint focus:border-signal focus:outline-none"
        />
        {value && (
          <button
            type="button"
            onClick={() => onPick("")}
            aria-label={`Clear ${label}`}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-dim hover:bg-panel hover:text-ink"
          >
            <X size={16} />
          </button>
        )}
      </div>
      {value && !open && (
        <div className="mt-1 truncate font-mono text-[11px] text-signal">{value}</div>
      )}
      {open && hits.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-[240px] w-full overflow-auto rounded-xl border border-line bg-bg shadow-xl">
          {hits.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onPick(r.id); setQ(""); setOpen(false); }}
                className="block w-full px-3 py-2 text-left hover:bg-panel"
              >
                <div className="truncate font-mono text-[12px] text-signal">{r.id}</div>
                <div className="truncate text-[13px] text-dim">{r.title}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type Row = { label: string; value: string | null };

/** Per-row "does A differ from B" flags (aligned by index). Exported for tests. */
export function diffFlags(a: Row[], b: Row[]): boolean[] {
  return a.map((row, i) => b[i] !== undefined && row.value !== b[i].value);
}

function rowsOf(d: RecordDetail | undefined): Row[] {
  if (!d) return [];
  const r = d.record as unknown as Record<string, unknown>;
  const rel = d.release ? `Release ${String(d.release.no).padStart(2, "0")} · ${d.release.date}` : null;
  const str = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));
  return [
    { label: "Title", value: str(r.title) },
    { label: "Archive", value: str(r.archive) },
    { label: "Agency", value: str((r as { agency_full?: string }).agency_full ?? r.agency) },
    { label: "Release", value: rel },
    { label: "Kind", value: str(r.kind) },
    { label: "Location", value: str(r.location) },
    { label: "Incident date", value: str(r.incident_date) },
    { label: "Doc date", value: str(r.doc_date) },
    { label: "Summary", value: str(r.summary) },
    { label: "AI summary", value: d.fullText?.aiSummary ? "✓" : "—" },
    { label: "Full text", value: d.fullText ? `${d.fullText.total_pages} pages` : "—" },
    { label: "TL;DR", value: d.tldr ? "✓" : "—" },
  ];
}

function Column({ id, rows, other }: { id: string; rows: Row[]; other: Row[] }) {
  if (!id)
    return (
      <div className="min-w-0 flex-1 rounded-2xl border border-dashed border-line p-6 text-center font-mono text-[12px] text-faint">
        Pick a record ↑
      </div>
    );
  if (!rows.length)
    return (
      <div className="min-w-0 flex-1">
        <Skeleton rows={8} h={24} />
      </div>
    );
  const r = rows[0];
  return (
    <div className="min-w-0 flex-1">
      <Link to={`/doc/${encodeURIComponent(id)}`} className="mb-3 block">
        <div className="truncate font-mono text-[12px] text-signal">{id}</div>
        <div className="text-[15px] font-bold leading-snug text-ink hover:underline">{r.value || id}</div>
      </Link>
      <dl>
        {rows.slice(1).map((row, i) => {
          const diff = diffFlags(rows, other)[i + 1];
          return (
            <div key={row.label} className="border-t border-line py-2">
              <dt className="font-mono text-[10px] uppercase tracking-[.5px] text-faint">{row.label}</dt>
              <dd className={`mt-0.5 text-[13px] leading-snug ${diff ? "font-semibold text-signal" : "text-dim"}`}>
                {row.value ?? <span className="text-faint">—</span>}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

export default function Compare() {
  useSetPageTitle("COMPARE", "Two records, side by side");
  const [sp, setSp] = useSearchParams();
  const a = sp.get("a") ?? "";
  const b = sp.get("b") ?? "";
  const qa = useRecord(a);
  const qb = useRecord(b);
  const series = qa.data?.series;

  const set = (k: "a" | "b", id: string) => {
    const next = new URLSearchParams(sp);
    if (id) next.set(k, id);
    else next.delete(k);
    setSp(next, { replace: true });
  };

  const rowsA = useMemo(() => rowsOf(qa.data), [qa.data]);
  const rowsB = useMemo(() => rowsOf(qb.data), [qb.data]);

  return (
    <div data-screen="compare" style={{ animation: "fadeup .3s ease both" }}>
      <h1 className="mb-4 text-[19px] font-bold text-ink">Compare records</h1>
      <div className="mb-2 flex items-start gap-2">
        <Picker label="A" value={a} onPick={(id) => set("a", id)} />
        <button
          type="button"
          onClick={() => { const n = new URLSearchParams(sp); n.set("a", b); n.set("b", a); if (!b) n.delete("a"); if (!a) n.delete("b"); setSp(n, { replace: true }); }}
          aria-label="Swap A and B"
          title="Swap"
          disabled={!a && !b}
          className="mt-6 grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line text-dim transition hover:border-signal hover:text-ink disabled:opacity-30"
        >
          <ArrowLeftRight size={16} />
        </button>
        <Picker label="B" value={b} onPick={(id) => set("b", id)} />
      </div>
      {a && !b && series && (series.prev || series.next) && (
        <div className="mb-4 flex flex-wrap gap-2 font-mono text-[11px]">
          <span className="self-center text-faint">Same series:</span>
          {series.prev && (
            <button type="button" onClick={() => set("b", series.prev!)} className="inline-flex items-center gap-1 rounded-full border border-line2 px-3 py-1.5 text-dim hover:border-signal hover:text-signal">
              <ChevronLeft size={13} strokeWidth={2.25} aria-hidden="true" />
              {series.prevTitle || series.prev}
            </button>
          )}
          {series.next && (
            <button type="button" onClick={() => set("b", series.next!)} className="inline-flex items-center gap-1 rounded-full border border-line2 px-3 py-1.5 text-dim hover:border-signal hover:text-signal">
              {series.nextTitle || series.next}
              <ChevronRight size={13} strokeWidth={2.25} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
      {(a || b) && (
        <div className="flex flex-col gap-6 md:flex-row">
          <Column id={a} rows={rowsA} other={rowsB} />
          <Column id={b} rows={rowsB} other={rowsA} />
        </div>
      )}
      {!a && !b && (
        <p className="mt-6 max-w-[520px] text-[14px] leading-[1.6] text-dim">
          Pick two records to compare field by field — handy for spotting redactions, renames and new
          summaries between releases. From a doc page, the compare button fills in A for you.
        </p>
      )}
    </div>
  );
}
