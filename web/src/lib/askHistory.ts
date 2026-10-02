// Questions this browser asked the archive, newest first. Per-browser only
// (users are anonymous); storage can be missing or blocked, so every access
// is guarded and failure just means an empty list.
export const ASK_HISTORY_KEY = "realufo.askHistory";
const MAX = 20;

export function readAskHistory(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(ASK_HISTORY_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function addAskHistory(q: string): string[] {
  const next = [q, ...readAskHistory().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, MAX);
  try {
    localStorage.setItem(ASK_HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* storage blocked */
  }
  return next;
}

export function clearAskHistory(): void {
  try {
    localStorage.removeItem(ASK_HISTORY_KEY);
  } catch {
    /* storage blocked */
  }
}
