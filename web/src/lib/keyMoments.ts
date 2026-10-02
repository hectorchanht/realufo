// Key moments for video records, parsed from the time-coded "Video
// Description" war.gov ships inside its summaries, e.g.
//   00:51-01:21: The sensor decreases its level of magnification …
// Lines that don't carry a time code (intro, AARO comments, disclaimer)
// come back as `prose`.

export interface KeyMoment {
  start: number; // seconds
  end: number | null; // null for a single time point ("00:29: …")
  text: string;
}

// [h:]mm:ss, seconds allowing a stray third digit ("00:011" in the source)
const TIME = String.raw`(?:\d{1,2}:)?\d{1,2}:\d{2,3}`;
const LINE = new RegExp(String.raw`^\s*(${TIME})(?:\s*[-–—]\s*(${TIME}))?\s*:?\s+(\S.*)$`);
const HEADER = /^\s*video description:\s*/i;

function seconds(t: string): number {
  return t.split(":").reduce((acc, p) => acc * 60 + Number(p), 0);
}

export function parseKeyMoments(summary: string | null | undefined): { prose: string; moments: KeyMoment[] } {
  const src = summary ?? "";
  const moments: KeyMoment[] = [];
  const kept: string[] = [];
  for (const line of src.split("\n")) {
    const m = LINE.exec(line);
    if (m) moments.push({ start: seconds(m[1]), end: m[2] ? seconds(m[2]) : null, text: m[3].trim() });
    else kept.push(line);
  }
  if (!moments.length) return { prose: src, moments };
  const prose = kept
    .map((l) => l.replace(HEADER, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  moments.sort((a, b) => a.start - b.start || (a.end ?? a.start) - (b.end ?? b.start));
  return { prose, moments };
}

/** records.ai_moments JSON → moments; invalid entries dropped, never throws. */
export function parseAiMoments(raw: string | null | undefined): KeyMoment[] {
  if (!raw) return [];
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch {
    return [];
  }
  const list = (doc as { moments?: unknown } | null)?.moments;
  if (!Array.isArray(list)) return [];
  return list.flatMap((m) => {
    const { start, end, text } = (m ?? {}) as { start?: unknown; end?: unknown; text?: unknown };
    const ok =
      typeof start === "number" && Number.isFinite(start) && start >= 0 &&
      typeof end === "number" && Number.isFinite(end) && end >= start &&
      typeof text === "string" && text.trim() !== "";
    return ok ? [{ start, end, text: text.trim() }] : [];
  });
}
