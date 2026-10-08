// Funnel strip: own-site link to the citizen skywatch gear guide
// (watchthenight.com). Cycles through a few short messages — the link always
// first, then an attractive description. One line on narrow screens; the
// message truncates instead of wrapping. Rotation pauses for
// prefers-reduced-motion users.
import { useEffect, useState } from "react";

const URL = "https://watchthenight.com";
const LINK_LABEL = "watchthenight.com";
const MESSAGES = [
  "Catch your own UAP — the skywatching gear we recommend",
  "Binoculars, cameras & night-sky picks to see it yourself",
  "Your field guide to spotting the unexplained",
];
const ROTATE_MS = 4500;

export default function FunnelStrip() {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setI((v) => (v + 1) % MESSAGES.length), ROTATE_MS);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="mb-4 flex items-center gap-1.5 whitespace-nowrap font-mono text-[11px] text-faint">
      <a href={URL} className="flex-none font-semibold text-cyan active:scale-[.97]">
        {LINK_LABEL}
      </a>
      <span aria-hidden="true" className="flex-none">
        →
      </span>
      <span key={i} className="min-w-0 truncate" style={{ animation: "fadein .35s ease both" }}>
        {MESSAGES[i]}
      </span>
    </div>
  );
}
