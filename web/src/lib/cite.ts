// Citation builders for the Cite button (pure functions, tested in web/src/tests/cite.test.ts).
export type CiteRecord = {
  id: string;
  agency?: string | null;
  agency_full?: string | null;
  title?: string | null;
  doc_date?: string | null;
};

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// doc_date is free-form: war.gov "7/10/26", others ISO. Best-effort parse to a
// real date; falls back to the year alone, then "n.d.".
function parseDate(raw: string | null | undefined): { year: string; long: string | null } {
  if (!raw) return { year: "n.d.", long: null };
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(raw);
  const mdy = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(raw);
  const m = iso ?? (mdy && [mdy[0], mdy[3].length === 2 ? `20${mdy[3]}` : mdy[3], mdy[1], mdy[2]]);
  if (m) {
    const [y, mo, d] = [m[1], Number(m[2]), Number(m[3])];
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31)
      return { year: y, long: `${MONTHS[mo - 1]} ${d}, ${y}` };
  }
  const y = /(19|20)\d{2}/.exec(raw)?.[0];
  return y ? { year: y, long: null } : { year: "n.d.", long: raw };
}

export function buildCitations(r: CiteRecord, origin: string) {
  const author = r.agency_full || r.agency || "U.S. Government";
  const title = (r.title || r.id).replace(/\s+/g, " ").trim();
  const url = `${origin}/doc/${encodeURIComponent(r.id)}`;
  const { year, long } = parseDate(r.doc_date);
  const dateShort = long ?? year;
  const key = `realufo:${r.id.replace(/[^A-Za-z0-9]+/g, "")}`;
  // RIS date: YYYY/MM/DD/ when we have a full date, else YYYY///.
  const risDate = (() => {
    const raw = r.doc_date ?? "";
    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(raw);
    if (iso) return `${iso[1]}/${iso[2].padStart(2, "0")}/${iso[3].padStart(2, "0")}/`;
    const mdy = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(raw);
    if (mdy) {
      const y = mdy[3].length === 2 ? `20${mdy[3]}` : mdy[3];
      return `${y}/${mdy[1].padStart(2, "0")}/${mdy[2].padStart(2, "0")}/`;
    }
    const y = /(19|20)\d{2}/.exec(raw)?.[0];
    return y ? `${y}///` : "";
  })();
  return {
    APA: `${author}. (${year}${long ? `, ${long.replace(/, \d{4}$/, "")}` : ""}). ${title} [Declassified record]. RealUFO Declassified UAP Archive. ${url}`,
    Chicago: `${author}. "${title}." RealUFO Declassified UAP Archive. ${dateShort}. ${url}.`,
    BibTeX: `@misc{${key},\n  author = {${author}},\n  title = {${title}},\n  year = {${year}},\n  url = {${url}},\n  note = {RealUFO Declassified UAP Archive}\n}`,
    RIS: [
      "TY  - ELEC",
      `TI  - ${title}`,
      `AU  - ${author}`,
      `DA  - ${risDate}`,
      `PY  - ${year}`,
      "PB  - RealUFO Declassified UAP Archive",
      `UR  - ${url}`,
      "ER  - ",
    ].join("\n"),
  };
}

