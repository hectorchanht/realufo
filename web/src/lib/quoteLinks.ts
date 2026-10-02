// Imageboard-style quote links: ">>24420082" in a post body points at post No.24420082.
export const QUOTE_SOURCE = String.raw`>>(\d{4,10})`;

export function quotedNos(body: string): number[] {
  return [...new Set([...body.matchAll(new RegExp(QUOTE_SOURCE, "g"))].map((m) => Number(m[1])))];
}

/** quoted No → the Nos of later posts in this thread that quote it (in post order). */
export function backlinks(posts: { no: number; body: string }[]): Map<number, number[]> {
  const inThread = new Set(posts.map((p) => p.no));
  const out = new Map<number, number[]>();
  for (const p of posts)
    for (const q of quotedNos(p.body))
      if (q !== p.no && inThread.has(q)) out.set(q, [...(out.get(q) ?? []), p.no]);
  return out;
}
