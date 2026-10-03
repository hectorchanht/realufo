// "Showing a saved copy" flag: true while API reads come from the service worker's
// cache (public/sw.js marks those X-SW-Cache: 1), false after any live read.
import { useSyncExternalStore } from "react";

let stale = false;
const subs = new Set<() => void>();

export function setStale(v: boolean) {
  if (v === stale) return;
  stale = v;
  subs.forEach((f) => f());
}

export const isStale = () => stale;

export const useStale = () =>
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    isStale,
  );
