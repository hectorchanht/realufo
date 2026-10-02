import type { HubKind, HubSummary } from "../api/types";

const TAG_KINDS: HubKind[] = ["release", "agency", "location", "decade"];

// The hub page for the Archive's tag filters, when exactly one of release /
// agency / location / decade is set and its value belongs to a live hub.
// Agency/location go through the hub's alias values ("DoW" → department-of-war).
export function hubForFilters(f: Partial<Record<HubKind, string>>, hubs: HubSummary[]): HubSummary | null {
  const active = TAG_KINDS.filter((k) => f[k]);
  if (active.length !== 1) return null;
  const kind = active[0];
  const v = f[kind]!;
  if (kind === "release" || kind === "decade") {
    const slug = kind === "decade" ? `${v}s` : v;
    return hubs.find((h) => h.kind === kind && h.slug === slug) ?? null;
  }
  return hubs.find((h) => h.kind === kind && h.values?.includes(v)) ?? null;
}
