// Ask the Archive (Spec 3) on its own tab. `?q=` is the submitted question;
// typing never asks (each answer costs money) — only Enter / the ASK button
// do. With no question: this browser's questions + the shared list. The
// worker serves /ask with robots noindex (AI answers can be wrong).
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useBootstrap } from "../api/queries";
import { AskAnswer } from "../components/AskAnswer";
import { AskHistory } from "../components/AskHistory";
import { addAskHistory } from "../lib/askHistory";
import { askComposerOpts } from "../lib/askThread";
import { useOverlay } from "../overlays/OverlayProvider";
import { useSetPageTitle } from "../lib/pageTitle";

export function Ask() {
  useSetPageTitle("ASK THE ARCHIVE", "AI answers from the declassified files");
  const { data: boot, isLoading } = useBootstrap();
  const { openComposer } = useOverlay();
  const [searchParams, setSearchParams] = useSearchParams();
  const ask = searchParams.get("q") ?? "";
  const [input, setInput] = useState(ask);
  useEffect(() => setInput(ask), [ask]);

  // Remember it in this browser and write ?q= (a history entry, so back returns to the lists).
  function openAsk(q: string) {
    setInput(q);
    addAskHistory(q);
    setSearchParams({ q });
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = input.replace(/\s+/g, " ").trim();
    if (q.length >= 3) openAsk(q);
  }

  if (!isLoading && !boot?.features?.ask) {
    return (
      <p className="font-mono text-[12px] text-dim">
        Ask is resting — try again later.{" "}
        <Link to="/archive" className="text-signal">
          Search the archive →
        </Link>
      </p>
    );
  }

  return (
    <div data-screen="ask" className="animate-[fadeup_.35s_ease_both]">
      <form onSubmit={submit} className="mb-3.5 flex items-center gap-[9px] rounded-xl border border-line2 bg-surface px-[13px] py-2.5">
        <span aria-hidden="true" className="text-[15px] text-faint">
          ◉
        </span>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          enterKeyHint="go"
          aria-label="Ask the archive"
          placeholder="ask the archive — e.g. what did the 1949 Los Alamos conference conclude?"
          className="min-w-0 flex-1 border-0 bg-transparent font-mono text-[12.5px] text-ink outline-none placeholder:text-faint"
        />
        <button type="submit" className="flex-none rounded-md bg-signal px-2 py-0.5 font-mono text-[10px] font-bold text-[#04140c]">
          ↵ ASK
        </button>
      </form>
      <p className="-mt-2 mb-3 px-0.5 font-mono text-[9.5px] text-faint">
        Questions are logged. Tap “share publicly” on an answer to list it under “Shared questions” — don’t include personal details.
      </p>
      {ask ? <AskAnswer question={ask} onPost={(d) => openComposer(askComposerOpts(ask, d))} /> : <AskHistory onPick={openAsk} />}
    </div>
  );
}

export default Ask;
