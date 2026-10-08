// /shelf — the full 65-title reading, listening + watching shelf. Every affiliate pick with its
// "why it matters here" blurb, the FTC disclosure, the email list, and the
// Ko-fi support card. The funnel's landing page: doc/hub modules link here,
// the email confirm page links back here.
import { Link } from "react-router-dom";
import { Coffee } from "lucide-react";
import { ALL_PICKS, AMAZON_TAG } from "../../../worker/lib/affiliate";
import { SOCIAL_PROFILES } from "../../../worker/lib/profiles";
import { useSetPageTitle } from "../lib/pageTitle";
import EmailAlerts from "../components/EmailAlerts";
import { PickCard, FtcNote } from "../components/GoDeeper";

const KOFI_URL =
  SOCIAL_PROFILES.find(([name]) => name === "Ko-fi")?.[1] ?? "https://ko-fi.com/realufo";

export default function Shelf() {
  useSetPageTitle("READING SHELF", "Sixty-five titles worth your shelf space");
  return (
    <div data-screen="shelf" className="mx-auto max-w-[720px]">
      <h1 className="font-mono text-[15px] font-bold text-ink">THE READING SHELF</h1>
      <p className="mb-4 mt-1 text-[13.5px] leading-[1.6] text-dim">
        Sixty-five books, audiobooks and documentaries the researchers behind these files actually read — each one picked because it
        illuminates something in the archive.{" "}
        {AMAZON_TAG
          ? "Buying through these links supports RealUFO at no extra cost to you."
          : ""}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {ALL_PICKS.map((p) => (
          <PickCard key={p.title} p={p} />
        ))}
      </div>
      <FtcNote />
      <section
        aria-labelledby="look-up"
        className="mt-6 rounded-xl border border-line p-4"
      >
        <h2
          id="look-up"
          className="font-mono text-[11px] font-semibold tracking-[.5px] text-ink"
        >
          🔭 LOOK UP — WATCH THE NIGHT
        </h2>
        <p className="mb-3 mt-1 text-[13px] leading-[1.55] text-dim">
          Read the files, then see for yourself. Our sister site reviews the telescopes,
          night-vision and thermal gear for citizen skywatching — what to buy, what to
          avoid, and how to watch the sky like a researcher.
        </p>
        <a
          href="https://watchthenight.com"
          target="_blank"
          rel="noopener"
          className="inline-block rounded-lg border border-line px-5 py-2.5 font-mono text-[13px] font-bold text-ink"
        >
          Visit Watch the Night ↗
        </a>
      </section>
      <section
        aria-labelledby="support-archive"
        className="mt-6 rounded-xl border border-line p-4"
      >
        <h2
          id="support-archive"
          className="flex items-center gap-1.5 font-mono text-[11px] font-semibold tracking-[.5px] text-ink"
        >
          <Coffee size={13} className="text-signal" /> SUPPORT THE ARCHIVE
        </h2>
        <p className="mb-3 mt-1 text-[13px] leading-[1.55] text-dim">
          RealUFO is free, open source, and ad-free. If these files taught you something, chip in
          for hosting and coffee.
        </p>
        <a
          href={KOFI_URL}
          target="_blank"
          rel="noopener"
          className="inline-block rounded-lg bg-signal px-5 py-2.5 font-mono text-[13px] font-bold text-black"
        >
          Buy us a coffee on Ko-fi ↗
        </a>
      </section>
      <div className="mt-6">
        <EmailAlerts />
      </div>
      <p className="mt-4 text-center font-mono text-[11px]">
        <Link to="/archive" className="text-signal hover:underline">
          ← Back to the archive
        </Link>
      </p>
    </div>
  );
}
