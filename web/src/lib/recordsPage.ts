import type { RecordsParams } from "../api/queries";

// Archive page size (matches the Worker's default `limit`) + the 1-based
// `?page=` param Archive writes and Doc reads to rebuild the same list.
export const RECORDS_PAGE_SIZE = 40;

export function recordsPage(sp: URLSearchParams): number {
  return Math.max(1, Math.floor(Number(sp.get("page")))) || 1;
}

// Archive filter URL params → useRecords params. Archive writes these, Doc
// reads them back so its swipe list is the same filtered list.
export function recordsFilter(sp: URLSearchParams): RecordsParams {
  const get = (k: string) => sp.get(k) || undefined;
  return {
    q: get("q"),
    archive: get("archive"),
    type: get("type"),
    redacted: sp.get("redacted") === "1" || undefined,
    release: get("release"),
    agency: get("agency"),
    decade: get("decade"),
    location: get("location"),
  };
}
