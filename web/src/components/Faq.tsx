// Data-written FAQ (worker/lib/releases.ts); same items the Worker emits as FAQPage JSON-LD.
import { Link } from "react-router-dom";
import type { FaqItem } from "../api/types";

export function Faq({ items }: { items: FaqItem[] }) {
  if (!items.length) return null;
  return (
    <section aria-labelledby="faq" className="mb-6">
      <h2 id="faq" className="mb-3 font-mono text-[11px] font-semibold tracking-[.5px] text-ink">FAQ</h2>
      <dl className="flex flex-col gap-3">
        {items.map((f) => (
          <div key={f.q}>
            <dt className="text-[13.5px] font-semibold text-ink">{f.q}</dt>
            <dd className="text-[13.5px] leading-[1.6] text-dim">
              {f.a}{" "}
              {f.link &&
                (f.link.href.startsWith("/") ? (
                  <Link to={f.link.href} className="text-signal hover:underline">{f.link.text}</Link>
                ) : (
                  <a href={f.link.href} target="_blank" rel="noopener" className="text-signal hover:underline">{f.link.text}</a>
                ))}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
