// Live "Ask the Archive" answer: fetches /api/ask, shows loading/error states,
// and lets the asker share it as a public page (Spec 8 §3.3).
import { useState } from "react";
import { useAsk, useShareAsk } from "../api/queries";
import { ApiError } from "../api/client";
import { shareLink, xIntent, type ShareResult } from "../lib/shareLink";
import { AskCard, ShareNote, CARD, ACTION } from "./AskCard";
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

  function publish() {
    setFailed(false);
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
      <button type="button" onClick={async () => setResult(await shareLink(question, url))} className={ACTION}>
        share link
      </button>
      <a href={xIntent(question, url)} target="_blank" rel="noopener" className={ACTION}>
        post on X
      </a>
      <button
        type="button"
        disabled={share.isPending}
        onClick={() => share.mutate({ id: logId, public: false }, { onSuccess: () => { setUrl(null); setResult(null); } })}
        className={ACTION}
      >
        undo
      </button>
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
          <button type="button" onClick={() => refetch()} className="rounded-md border border-line2 px-2 py-0.5 text-signal">
            retry
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
