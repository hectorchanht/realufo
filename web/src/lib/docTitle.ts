// How a file's id and title are shown together. Titles come as "<ID>, <title>"
// (war.gov), "<ID>_<title>", the filename the id was built from (AARO, FBI
// vault: AARO-IMG-Go_Fast_UAP / "Go Fast UAP"), or a plain title. Returns the
// title with any id prefix and underscores removed, and whether the id adds
// anything beside it (false when one is just a respelling of the other).
// Same rule as worker/lib/ssr.ts docTitleParts — keep them in sync.
const squash = (s: string) =>
  s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map((w) => w.replace(/^0+(?=\d)/, "")).join("");

export function docTitleParts(id: string, raw: string | null | undefined): { title: string; showId: boolean } {
  let t = raw || "";
  if (t.startsWith(id) && /^[,_\s:]/.test(t.slice(id.length))) t = t.slice(id.length);
  t = t.replace(/_/g, " ").replace(/\s+/g, " ").replace(/^[\s,:;]+|[\s,]+$/g, "");
  if (!t) return { title: id, showId: false };
  const [a, b] = [squash(t), squash(id)];
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  return { title: t, showId: !(long.includes(short) && short.length >= long.length / 2) };
}

// Tab / search title: "<id> — <title>", or the title alone when the id only repeats it.
export const docPageTitle = (id: string, raw: string | null | undefined) => {
  const p = docTitleParts(id, raw);
  return p.showId ? `${id} — ${p.title}` : p.title;
};
