// /privacy — static policy; text shared with the Worker's crawler body.
// LegalPage is also the layout for /terms (Terms.tsx).
import { PRIVACY_HTML } from "../../../worker/lib/privacy";
import { useSetPageTitle } from "../lib/pageTitle";

export function LegalPage({ title, html }: { title: string; html: string }) {
  useSetPageTitle(title.toUpperCase(), "", title);
  return (
    <div data-screen={title.toLowerCase()} style={{ animation: "fadeup .3s ease both" }}>
      <h1 className="mb-4 text-[19px] font-bold leading-[1.3] text-ink">{title}</h1>
      <div
        className="max-w-[680px] space-y-3 text-[14px] leading-[1.6] text-dim [&_a]:text-signal [&_b]:text-ink [&_h2]:mt-5 [&_h2]:font-mono [&_h2]:text-[11px] [&_h2]:font-semibold [&_h2]:tracking-[.5px] [&_h2]:text-ink [&_li]:mb-2 [&_ul]:list-disc [&_ul]:pl-5"
        // Trusted constant from the repo, not user input.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

export default function Privacy() {
  return <LegalPage title="Privacy" html={PRIVACY_HTML} />;
}
