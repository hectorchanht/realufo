// A shared Ask answer's permanent page (Spec 8 §3.4): the answer frozen when it
// was asked, free to open, and shown even while new asks are resting. The
// worker pre-renders the same URL (indexed) for crawlers and link previews.
import { Share2 } from "lucide-react";
import { BrandIcon } from "../components/SiteFooter";
import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useBootstrap, useSharedAsk } from "../api/queries";
import { AskCard, ShareNote, CARD, ACTION } from "../components/AskCard";
import { LoadError } from "../components/LoadError";
import { addAskHistory } from "../lib/askHistory";
import { askIdOf, shareLink, xIntent, type ShareResult } from "../lib/shareLink";
import { useSetPageTitle } from "../lib/pageTitle";

const GONE = "this answer isn't shared anymore.";

// Keyed by id so the share note and half-typed question don't carry over when
// the router keeps this screen mounted across /ask/12-… -> /ask/13-….
export function AskShared() {
  const { id: param = "" } = useParams();
  const id = askIdOf(param);
  return <SharedAnswer key={id ?? "none"} id={id} />;
}

function SharedAnswer({ id }: { id: number | null }) {
  const { data, isLoading, error, refetch } = useSharedAsk(id);
  const { data: boot } = useBootstrap();
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [result, setResult] = useState<ShareResult | null>(null);
  useSetPageTitle("ASK THE ARCHIVE", "shared answer", data?.question);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = input.replace(/\s+/g, " ").trim();
    if (q.length < 3) return;
    addAskHistory(q);
    navigate(`/ask?q=${encodeURIComponent(q)}`);
  }

  if (id == null) return <LoadError error={null} onRetry={() => {}} notFound={GONE} />;
  if (isLoading) return <div className={`${CARD} font-mono text-[11px] text-faint`}>◉ consulting the archive…</div>;
  if (error || !data) return <LoadError error={error} onRetry={() => refetch()} notFound={GONE} />;

  return (
    <div data-screen="ask-shared" className="animate-[fadeup_.35s_ease_both]">
      <AskCard
        question={data.question}
        data={data}
        footer={
          <>
            <button type="button" onClick={async () => setResult(await shareLink(data.question, data.url))} aria-label="Share" title="Share" className={ACTION}>
              <Share2 size={13} strokeWidth={1.75} aria-hidden="true" />
            </button>
            <a href={xIntent(data.question, data.url)} target="_blank" rel="noopener" aria-label="Post on X" title="Post on X" className={ACTION}>
              <BrandIcon name="X" size={12} />
            </a>
            <ShareNote result={result} url={data.url} />
          </>
        }
      />
      {boot?.features?.ask && (
        <form onSubmit={submit} className="flex items-center gap-[9px] rounded-xl border border-line2 bg-surface px-[13px] py-2.5">
          <span aria-hidden="true" className="text-[15px] text-faint">
            ◉
          </span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            enterKeyHint="go"
            aria-label="Ask the archive"
            placeholder="ask your own question…"
            className="min-w-0 flex-1 border-0 bg-transparent font-mono text-[12.5px] text-ink outline-none placeholder:text-faint"
          />
          <button type="submit" className="flex-none rounded-md bg-signal px-2 py-0.5 font-mono text-[10px] font-bold text-on-signal">
            ↵ ASK
          </button>
        </form>
      )}
    </div>
  );
}

export default AskShared;
