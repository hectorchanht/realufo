// How a file's id and title are shown together. Titles come as "<ID>, <title>"
// (war.gov), "<ID>_<title>", the filename the id was built from (AARO, FBI
// vault: AARO-IMG-Go_Fast_UAP / "Go Fast UAP"), or a plain title. Returns the
// title with any id prefix and underscores removed, and whether the id adds
// anything beside it (false when one is just a respelling of the other).
// Same rule as worker/lib/ssr.ts docTitleParts — keep them in sync.
const squash = (s: string) =>
  s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map((w) => w.replace(/^0+(?=\d)/, "")).join("");

// `id` in the result is the id to display: the record id, or the official
// code the title leads with when the record id is an internal slug
// (WARGOV-VID-111688723 / "DOW-UAP-PR019, Unresolved UAP Report…").
export function docTitleParts(id: string, raw: string | null | undefined, kind?: string): { id: string; title: string; showId: boolean } {
  let t = raw || "";
  let label = id;
  // National Archives filename "<record group>_<NAID>_<title>" (341_110677_Numerical_File):
  // drop the numbers, name the group; FBI (RG 65) case files read as file + part.
  const nara = t.match(/^(\d+)_(?:HS1-)?\d+_\s*(.+)$/);
  if (nara) {
    const rest = nara[2].replace(/_/g, " ").replace(/\s+/g, " ").replace(/^box\d*\s+/i, "").trim();
    const fbi = nara[1] === "65" && rest.match(/^(\d+-[A-Z]+-\d+)(?:\s+(Section|Serial|Sub)\s+0*(\w+))?$/i);
    const part = fbi && fbi[2] ? `, ${fbi[2][0].toUpperCase()}${fbi[2].slice(1).toLowerCase()} ${fbi[3]}` : "";
    return { id: label, title: fbi ? `FBI file ${fbi[1]}${part}` : `${rest} (National Archives RG ${nara[1]})`, showId: false };
  }
  const code = t.match(/^([A-Z]{2,6}-UAP-[A-Za-z0-9-]+?)(?=[,_\s:])/)?.[1];
  if (t.startsWith(id) && /^[,_\s:]/.test(t.slice(id.length))) t = t.slice(id.length);
  // A video/image slug borrowing its PDF twin's code (DOW-UAP-PR019 is both) gets
  // the kind appended, so the pair doesn't share one id and one title.
  else if (code) [label, t] = [kind && kind !== "pdf" ? `${code} (${kind})` : code, t.slice(code.length)];
  t = t.replace(/_/g, " ").replace(/\s+/g, " ").replace(/^[\s,:;]+|[\s,]+$/g, "");
  // war.gov quotes some video titles whole ("Spherical UAP in clouds"), most not: show all bare.
  t = t.replace(/^["“]([^"“”]+)["”]$/, "$1");
  if (!t) return { id: label, title: label, showId: false };
  const [a, b] = [squash(t), squash(label)];
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  // Respelled: one squashes into the other, or most of the title's words (3+
  // chars) sit inside the id (filename ids drift: "Taqaddam_…_Final.pdf").
  const words = t.toLowerCase().split(/[^a-z0-9]+/).map((w) => w.replace(/^0+(?=\d)/, "")).filter((w) => w.length >= 3);
  const inId = words.filter((w) => b.includes(w)).length;
  const respelled = (long.includes(short) && short.length >= long.length / 2) || (words.length > 0 && inId / words.length >= 0.6);
  return { id: label, title: t, showId: !respelled };
}

// Tab / search title: "<id> — <title>", or the title alone when the id only repeats it.
export const docPageTitle = (id: string, raw: string | null | undefined, kind?: string) => {
  const p = docTitleParts(id, raw, kind);
  return p.showId ? `${p.id} — ${p.title}` : p.title;
};
