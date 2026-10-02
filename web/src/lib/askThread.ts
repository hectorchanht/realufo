// Turns an Ask answer into a board thread: each [n] becomes source n's record
// id, which the thread screen links and embeds (RecordEmbed).
import type { AskResponse } from "../api/types";
import type { ComposerOpts } from "../overlays/OverlayProvider";

type Answer = Pick<AskResponse, "answer" | "sources">;

export function askThreadBody(question: string, data: Answer): string {
  const idOf = new Map(data.sources.map((s) => [s.n, s.record_id]));
  const answer = data.answer
    .replace(/\s*\[(\d+)\]/g, (_m, d: string) => {
      const id = idOf.get(Number(d));
      return id ? ` ${id}` : "";
    })
    .trim();
  const ids = [...new Set(data.sources.map((s) => s.record_id))];
  return `Q: ${question}\n\n${answer}\n\nSources: ${ids.join(", ")}\n\n— via Ask the Archive`;
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
