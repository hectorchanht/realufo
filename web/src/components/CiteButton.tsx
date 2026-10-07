// Cite button on doc pages: one-click copy of a citation in APA / Chicago /
// BibTeX / RIS, so researchers and journalists link back to the archive
// (SEO + attribution). Icon-only (Quote), opens a small modal with format
// tabs + copy button.
//
// The modal is portaled to <body>: doc/case screens run a filling `fadeup`
// enter animation, and a transform animation (even a finished fill) makes the
// screen div a containing block for `position:fixed` descendants — the modal
// then sizes to the whole article height and its card lands far below the
// viewport, leaving only the dim visible. (Same trap MoreMenu's sheet avoids
// by portaling past BottomTab's slide-away transform.)
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Quote, X, Copy, Check } from "lucide-react";
import { useOverlay } from "../overlays/OverlayProvider";
import { buildCitations, type CiteRecord } from "../lib/cite";

const FORMATS = ["APA", "Chicago", "BibTeX", "RIS"] as const;

export default function CiteButton({ record }: { record: CiteRecord | undefined }) {
  const { toast } = useOverlay();
  const [open, setOpen] = useState(false);
  const [fmt, setFmt] = useState<(typeof FORMATS)[number]>("APA");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      // Capture phase + stopPropagation: Doc's own window keydown handler
      // treats Esc as "leave the file" (goBack). Our listener is registered
      // after Doc's (it mounts when the modal opens), so in the bubble phase
      // Doc's handler would run first and navigate away even as we close the
      // modal. Capturing on window lets us claim the key first.
      e.stopPropagation();
      setOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open ]);

  if (!record) return null;
  const cites = buildCitations(record, window.location.origin);

  async function copy() {
    const text = cites[fmt];
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // clipboard API unavailable (insecure context): show it so it can be selected manually
      toast("Copy failed — select the text manually");
      return;
    }
    setCopied(true);
    toast(`${fmt} citation copied`);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Cite this record"
        title="Cite this record"
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-dim transition hover:bg-panel hover:text-ink"
      >
        <Quote size={20} />
      </button>
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
            onClick={() => setOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Cite this record"
          >
          <div
            className="w-full max-w-[520px] rounded-2xl border border-line bg-bg p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[.5px] text-ink">
                Cite this record
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="grid h-9 w-9 place-items-center rounded-full text-dim hover:bg-panel hover:text-ink"
              >
                <X size={18} />
              </button>
            </div>
            <div className="mb-3 flex gap-1" role="tablist" aria-label="Citation format">
              {FORMATS.map((f) => (
                <button
                  key={f}
                  type="button"
                  role="tab"
                  aria-selected={fmt === f}
                  onClick={() => setFmt(f)}
                  className={`rounded-full px-4 py-2 font-mono text-[12px] transition ${
                    fmt === f ? "bg-signal text-bg" : "text-dim hover:bg-panel hover:text-ink"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
            <pre className="mb-3 max-h-[40vh] overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-panel p-3 font-mono text-[12px] leading-[1.6] text-ink">
              {cites[fmt]}
            </pre>
            <button
              type="button"
              onClick={copy}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-signal py-3 font-mono text-[13px] font-semibold text-bg transition hover:opacity-90"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? "Copied" : `Copy ${fmt}`}
            </button>
            <p className="mt-2 text-center font-mono text-[11px] text-faint">
              Mirrored official values stay verbatim — cite, don't rewrite.
            </p>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
