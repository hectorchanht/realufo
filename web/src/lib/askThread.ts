// Turns an Ask answer into a board thread: each [n] stays as a marker; the
// Sources list links each n to its file (a realufo.org doc URL, which the
// thread screen renders as a RecordEmbed).
import type { AskResponse } from "../api/types";
import type { ComposerOpts } from "../overlays/OverlayProvider";

type Answer = Pick<AskResponse, "answer" | "sources">;

const SITE = "https://realufo.org";
export const docUrl = (id: string) => `${SITE}/doc/${encodeURIComponent(id)}`;

export function askThreadBody(question: string, data: Answer): string {
  const known = new Set(data.sources.map((s) => s.n));
  // keep [n] markers that have a source; drop dangling ones
  const answer = data.answer.replace(/\s*\[(\d+)\]/g, (m, d: string) => (known.has(Number(d)) ? m : "")).trim();
  const lines = data.sources.map((s) => `[${s.n}] ${docUrl(s.record_id)}`);
  return `Q: ${question}\n\n${answer}\n\nSources:\n${lines.join("\n")}\n\n— via Ask the Archive`;
}

export function askComposerOpts(question: string, data: Answer): ComposerOpts {
  const first = data.sources[0];
  return {
    mode: "newThread",
    boardId: "uap",
    presetTitle: question.slice(0, 120),
    presetBody: askThreadBody(question, data),
    sourceRecordId: first?.record_id,
    refLabel: first?.title,
  };
}
