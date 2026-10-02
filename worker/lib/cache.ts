// Workers Cache API JSON memo: `load()` runs at most once per key per colo per
// `ttl` seconds. null results are not stored (misses stay cheap to retry).
// Keys are absolute URLs on the serving origin, e.g. `${origin}/__page/doc/X`.
export async function cachedJson<T>(key: string, load: () => Promise<T | null>, ttl = 3600): Promise<T | null> {
  const req = new Request(key);
  const hit = await caches.default.match(req);
  if (hit) return hit.json<T>();
  const value = await load();
  if (value != null)
    await caches.default.put(
      req,
      new Response(JSON.stringify(value), {
        headers: { "content-type": "application/json", "cache-control": `max-age=${ttl}` },
      })
    );
  return value;
}
