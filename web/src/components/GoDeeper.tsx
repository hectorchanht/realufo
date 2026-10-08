// "FURTHER READING" — the monetization module on doc + hub pages.
// Keyword-matched affiliate picks for what's being read, then the full
// 65-title shelf (expandable), then the funnel's support strip: email
// alerts + Ko-fi. Blurbs explain WHY each book matters here — that's
// what makes people click.
import { useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, ChevronDown, Coffee, Bell, Newspaper } from "lucide-react";
import {
  AMAZON_TAG,
  affiliateUrl,
  ALL_PICKS,
  type AffiliatePick,
} from "../../../worker/lib/affiliate";
import { SOCIAL_PROFILES } from "../../../worker/lib/profiles";

const KOFI_URL =
  SOCIAL_PROFILES.find(([name]) => name === "Ko-fi")?.[1] ?? "https://ko-fi.com/realufo";

export function PickCard({ p }: { p: AffiliatePick }) {
  return (
    <a
      href={affiliateUrl(p)}
      target="_blank"
      rel="noopener sponsored"
      className="block rounded-xl border border-line p-3 hover:border-signal"
    >
      <div className="text-[13.5px] font-semibold text-ink">{p.title}</div>
      <div className="font-mono text-[10.5px] text-faint">{p.creator}</div>
      <p className="mt-1 text-[12.5px] leading-[1.5] text-dim">{p.blurb}</p>
      <div className="mt-2 font-mono text-[10px] text-signal">View on Amazon →</div>
    </a>
  );
}

function ShelfRow({ p }: { p: AffiliatePick }) {
  return (
    <a
      href={affiliateUrl(p)}
      target="_blank"
      rel="noopener sponsored"
      className="flex items-baseline justify-between gap-3 border-b border-line py-2 last:border-0"
    >
      <span className="min-w-0">
        <span className="text-[13px] font-medium text-ink">{p.title}</span>
        <span className="font-mono text-[11px] text-faint"> — {p.creator}</span>
      </span>
      <span className="flex-none font-mono text-[10px] text-signal">Amazon →</span>
    </a>
  );
}

export function FtcNote() {
  return (
    <div className="mt-1 font-mono text-[9.5px] text-faint">
      {AMAZON_TAG
        ? "As an Amazon Associate, RealUFO earns from qualifying purchases."
        : "External links to Amazon."}
    </div>
  );
}

export function SupportStrip() {
  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-dim">
      <a
        href="https://github.com/hectorchanht/realufo"
        target="_blank"
        rel="noopener"
        className="hover:underline"
      >
        RealUFO is free &amp; open source.
      </a>
      <Link to="/notifications" aria-label="Get new-file alerts" title="Get new-file alerts" className="grid h-8 w-8 place-items-center rounded-full text-signal hover:underline">
        <Bell size={15} aria-hidden="true" />
      </Link>
      <a href={KOFI_URL} target="_blank" rel="noopener" aria-label="Buy us a coffee" title="Buy us a coffee" className="grid h-8 w-8 place-items-center rounded-full text-signal hover:underline">
        <Coffee size={15} aria-hidden="true" />
      </a>
    </p>
  );
}

export interface PressRef {
  year: number;
  location: string;
}

// Contemporary press: link historical records to Newspapers.com so readers
// can see the original newspaper coverage. Query = location + year + ufo.
export function pressUrl(pr: PressRef): string {
  const q = encodeURIComponent(`${pr.location} ${pr.year} ufo`.trim());
  return `https://www.newspapers.com/search/?query=${q}`;
}

export function pressRefFor(incidentDate?: string | null, location?: string | null): PressRef | null {
  if (!incidentDate) return null;
  const m = incidentDate.match(/(\d{4})/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  if (year >= 2000 || year < 1800) return null;
  return { year, location: (location || "").trim() };
}

export default function GoDeeper({ picks, note, press }: { picks: AffiliatePick[]; note?: string; press?: PressRef | null }) {
  const [shelfOpen, setShelfOpen] = useState(false);
  const shown = new Set(picks.map((p) => p.title));
  const rest = ALL_PICKS.filter((p) => !shown.has(p.title));
  return (
    <section aria-labelledby="further-reading" className="mb-6">
      <h2
        id="further-reading"
        className="mb-1 flex items-center gap-1.5 font-mono text-[11px] font-semibold tracking-[.5px] text-ink"
      >
        <BookOpen size={13} className="text-signal" /> FURTHER READING
      </h2>
      {picks.length > 0 ? (
        <>
          <p className="mb-2 text-[12px] text-dim">
            {note ?? "The books the researchers behind these files actually read."}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {picks.map((p) => (
              <PickCard key={p.title} p={p} />
            ))}
          </div>
        </>
      ) : (
        <p className="mb-2 text-[12px] text-dim">
          Sixty-five books, audiobooks and documentaries the researchers behind these files actually read — start with the shelf.
        </p>
      )}
      {press && (
        <a
          href={pressUrl(press)}
          target="_blank"
          rel="noopener"
          className="mt-2 flex items-center gap-2 rounded-xl border border-line p-3 hover:border-signal"
        >
          <Newspaper size={14} className="flex-none text-signal" />
          <span className="min-w-0">
            <span className="block text-[13px] font-medium text-ink">
              Read the {press.year} newspaper coverage
            </span>
            <span className="block font-mono text-[10.5px] text-faint">
              Contemporary press on Newspapers.com — see this case as the world saw it
            </span>
          </span>
          <span className="ml-auto flex-none font-mono text-[10px] text-signal">Newspapers.com →</span>
        </a>
      )}
      {rest.length > 0 && (
        <div className="mt-2 rounded-xl border border-line">
          <button
            type="button"
            onClick={() => setShelfOpen((v) => !v)}
            aria-expanded={shelfOpen}
            className="flex w-full items-center justify-between px-3 py-2.5 font-mono text-[11px] text-dim hover:text-ink"
          >
            <span>Browse the full {ALL_PICKS.length}-book shelf</span>
            <ChevronDown
              size={14}
              className={`transition-transform ${shelfOpen ? "rotate-180" : ""}`}
            />
          </button>
          {shelfOpen && (
            <div className="border-t border-line px-3 pb-1">
              {rest.map((p) => (
                <ShelfRow key={p.title} p={p} />
              ))}
              <Link
                to="/shelf"
                className="block py-2 font-mono text-[11px] text-signal hover:underline"
              >
                See the full shelf with why-each-matters notes →
              </Link>
            </div>
          )}
        </div>
      )}
      <FtcNote />
      <SupportStrip />
    </section>
  );
}
