// Live "Ask the Archive" answer: fetches /api/ask, shows loading/error states,
// and lets the asker share it as a public page (Spec 8 §3.3).
import { RotateCw, Share2 } from "lucide-react";
import { BrandIcon } from "./SiteFooter";
import { useState } from "react";
import { useAsk, useShareAsk } from "../api/queries";
import { ApiError } from "../api/client";
import { shareLink, xIntent, type ShareResult } from "../lib/shareLink";
import { AskCard, ShareNote, CARD, ACTION, ICON_ACTION } from "./AskCard";
import type { AskResponse } from "../api/types";

function errorCopy(e: unknown) {
  if (e instanceof ApiError && e.status === 429) return "slow down — too many questions";
  if (e instanceof ApiError && e.status === 503) return "Ask is resting — try again later";
  return null;
}

function ShareControls({ question, logId }: { question: string; logId: number }) {
  const share = useShareAsk();
  const [url, setUrl] = useState<string | null>(null);
  const [result, setResult] = useState<ShareResult | null>(null);
  const [failed, setFailed] = useState(false);
  const [undoFailed, setUndoFailed] = useState(false);

  function publish() {
    setFailed(false);
    setUndoFailed(false);
    share.mutate(
      { id: logId, public: true },
      {
        onSuccess: async (r) => {
          setUrl(r.url);
          setResult(await shareLink(question, r.url));
        },
        onError: () => setFailed(true),
      }
    );
  }

  if (!url)
    return (
      <>
        <button type="button" disabled={share.isPending} onClick={publish} className={ACTION}>
          share
        </button>
        {failed && <span className="font-mono text-[10px] text-dim">couldn't share — try again</span>}
      </>
    );
  return (
    <>
      <span className="font-mono text-[10px] text-signal">✓ shared</span>
      <button type="button" onClick={async () => setResult(await shareLink(question, url))} aria-label="Share link" title="Share link" className={ICON_ACTION}>
        <Share2 size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
      <a href={xIntent(question, url)} target="_blank" rel="noopener" aria-label="Post on X" title="Post on X" className={ICON_ACTION}>
        <BrandIcon name="X" size={14} />
      </a>
      <button
        type="button"
        disabled={share.isPending}
        onClick={() => {
          setUndoFailed(false);
          share.mutate(
            { id: logId, public: false },
            { onSuccess: () => { setUrl(null); setResult(null); }, onError: () => setUndoFailed(true) }
          );
        }}
        className={ACTION}
      >
        undo
      </button>
      {undoFailed && <span className="font-mono text-[10px] text-dim">couldn't undo — try again</span>}
      <ShareNote result={result} url={url} />
    </>
  );
}

export function AskAnswer({ question, onPost }: { question: string; onPost?: (data: AskResponse) => void }) {
  const { data, isLoading, error, refetch } = useAsk(question);

  if (isLoading) return <div className={`${CARD} font-mono text-[11px] text-faint`}>◉ consulting the archive…</div>;
  if (error) {
    const copy = errorCopy(error);
    return (
      <div className={`${CARD} flex items-center gap-3 font-mono text-[11px] text-dim`}>
        <span className="flex-1">{copy ?? "Couldn't reach the archive — try again"}</span>
        {!copy && (
          <button type="button" onClick={() => refetch()} aria-label="Retry" title="Retry" className="grid size-8 place-items-center rounded-md border border-line2 text-signal">
            <RotateCw size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        )}
      </div>
    );
  }
  if (!data) return null;

  const canShare = data.sources.length > 0 && data.log_id != null;
  const canPost = data.sources.length > 0 && !!onPost;
  return (
    <AskCard
      question={question}
      data={data}
      footer={
        canShare || canPost ? (
          <>
            {canShare && <ShareControls key={data.log_id} question={question} logId={data.log_id!} />}
            {canPost && (
              <button type="button" onClick={() => onPost!(data)} className={ACTION}>
                ⤴ post to a board
              </button>
            )}
          </>
        ) : undefined
      }
    />
  );
}

export default AskAnswer;
