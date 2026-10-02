import { useRouteError } from "react-router-dom";

// Lazy screen chunks 404 after a deploy (old hashed filename) → offer a reload.
const CHUNK_RE = /dynamically imported module|Importing a module script failed|Failed to fetch|error loading dynamically/i;

export function RouteError() {
  const err = useRouteError();
  const msg = err instanceof Error ? err.message : String(err ?? "");
  const stale = CHUNK_RE.test(msg);
  return (
    <div data-screen="route-error" role="alert" className="px-5 py-[60px] text-center font-mono text-[12px] text-faint">
      {stale ? "a newer version of the site is live." : "something broke on this page."}
      <div className="mt-4">
        <button type="button" onClick={() => window.location.reload()} className="rounded-md border border-line2 px-3 py-1 text-signal">reload</button>
      </div>
    </div>
  );
}
