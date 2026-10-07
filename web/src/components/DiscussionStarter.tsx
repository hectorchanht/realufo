// Pinned AI discussion prompt for quiet doc pages: one sharp, document-specific
// question to give lurkers something concrete to react to instead of a blank
// box. Renders only while the record has fewer than STARTER_MAX_COMMENTS
// comments; hidden once discussion is alive. Dismiss persists per record in
// localStorage. The "Reply" affordance focuses the sticky quick-reply bar via
// the onReply callback (same focus pattern as the vote nudge).
import { useState } from "react";
import { MessageCircle, Sparkles, X } from "lucide-react";
import { useDiscussionStarter } from "../api/queries";
import { useLang } from "../lib/lang";

export const STARTER_MAX_COMMENTS = 3;

const dismissedKey = (id: string) => `realufo.starter.dismissed.${id}`;

export function DiscussionStarter({
  recordId,
  commentCount,
  onReply,
}: {
  recordId: string;
  commentCount: number;
  onReply: () => void;
}) {
  const { lang, t } = useLang();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(dismissedKey(recordId)) === "1";
    } catch {
      return false;
    }
  });
  const quiet = commentCount < STARTER_MAX_COMMENTS;
  const { data } = useDiscussionStarter(recordId, lang, quiet && !dismissed);
  if (!quiet || dismissed || !data?.question) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(dismissedKey(recordId), "1");
    } catch {
      // private mode: dismissal just lasts the session
    }
    setDismissed(true);
  };

  return (
    <div className="mb-3.5 rounded-xl border border-line2 bg-surface p-[13px]">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[.6px] text-amber">
          <Sparkles size={12} aria-hidden="true" />
          {t("doc.starterLabel")}
        </span>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t("doc.dismiss")}
          className="grid h-7 w-7 flex-none place-items-center rounded-lg text-dim active:scale-90"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      <p className="text-[13.5px] leading-[1.6] text-ink">{data.question}</p>
      <button
        type="button"
        onClick={onReply}
        className="mt-2 flex items-center gap-1.5 font-mono text-[11px] font-semibold text-cyan active:scale-[.97]"
      >
        <MessageCircle size={13} aria-hidden="true" />
        {t("doc.starterReply")}
      </button>
    </div>
  );
}
