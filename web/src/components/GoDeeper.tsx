// "GO DEEPER" — highly relevant books for the topic you're browsing.
// Rendered on topic hub pages. Blurbs explain WHY each book matters here;
// that's what makes people willingly click.
import { AMAZON_TAG, affiliateUrl, picksForTopic, type AffiliatePick } from "../../../worker/lib/affiliate";

function Pick({ p }: { p: AffiliatePick }) {
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

export default function GoDeeper({ slug }: { slug: string }) {
  const picks = picksForTopic(slug);
  if (picks.length === 0) return null;
  return (
    <section aria-labelledby="go-deeper" className="mb-6">
      <h2 id="go-deeper" className="mb-1 font-mono text-[11px] font-semibold tracking-[.5px] text-ink">
        GO DEEPER
      </h2>
      <p className="mb-2 text-[12px] text-dim">The books the researchers behind these files actually read.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {picks.map((p) => (
          <Pick key={p.title} p={p} />
        ))}
      </div>
      <div className="mt-1 font-mono text-[9.5px] text-faint">
        {AMAZON_TAG
          ? "As an Amazon Associate, RealUFO earns from qualifying purchases."
          : "External links to Amazon."}
      </div>
    </section>
  );
}
