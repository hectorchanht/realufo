// Archive page size (matches the Worker's default `limit`) + the 1-based
// `?page=` param Archive writes and Doc reads to rebuild the same list.
export const RECORDS_PAGE_SIZE = 40;

export function recordsPage(sp: URLSearchParams): number {
  return Math.max(1, Math.floor(Number(sp.get("page")))) || 1;
}
