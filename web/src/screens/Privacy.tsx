// /privacy — static policy; text shared with the Worker's crawler body.
import { PRIVACY_HTML } from "../../../worker/lib/privacy";
import { useSetPageTitle } from "../lib/pageTitle";

export default function Privacy() {
  useSetPageTitle("PRIVACY", "", "Privacy");
  return (
    <div data-screen="privacy" style={{ animation: "fadeup .3s ease both" }}>
      <h1 className="mb-4 text-[19px] font-bold leading-[1.3] text-ink">Privacy</h1>
      <div
        className="max-w-[680px] space-y-3 text-[14px] leading-[1.6] text-dim [&_a]:text-signal [&_b]:text-ink [&_h2]:mt-5 [&_h2]:font-mono [&_h2]:text-[11px] [&_h2]:font-semibold [&_h2]:tracking-[.5px] [&_h2]:text-ink [&_li]:mb-2 [&_ul]:list-disc [&_ul]:pl-5"
        // Trusted constant from the repo, not user input.
        dangerouslySetInnerHTML={{ __html: PRIVACY_HTML }}
      />
    </div>
  );
}
