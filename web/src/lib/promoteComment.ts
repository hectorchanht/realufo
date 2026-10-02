// "⤴ to a board": a comment becomes a thread that reads on its own — the
// comment's own words (first line as title), where it came from, and its image.
import type { Comment } from "../api/types";
import type { ComposerOpts } from "../overlays/OverlayProvider";

export function promoteCommentOpts(
  c: Pick<Comment, "body" | "image_url">,
  from: { title: string; boardId: string; recordId?: string; caseSlug?: string },
): ComposerOpts {
  const firstLine = c.body.trim().split("\n")[0].trim();
  return {
    mode: "newThread",
    boardId: from.boardId,
    sourceRecordId: from.recordId,
    caseSlug: from.caseSlug,
    refLabel: from.title,
    presetTitle: (firstLine.length > 70 ? firstLine.slice(0, 69) + "…" : firstLine) || from.title,
    presetBody: `${c.body.trim()}\n\n— from the discussion on ${from.title}`,
    presetImageUrl: c.image_url ?? undefined,
  };
}
