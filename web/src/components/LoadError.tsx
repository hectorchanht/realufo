import { RotateCw } from "lucide-react";
import { ApiError } from "../api/client";

/** Failed query → "not found" for a 404 (or no error at all), otherwise a retry line. */
export function LoadError({ error, onRetry, notFound }: { error: unknown; onRetry: () => void; notFound?: string }) {
  const missing = !error || (error instanceof ApiError && error.status === 404);
  if (missing && notFound)
    return <div className="px-5 py-[60px] text-center font-mono text-[12px] text-faint">{notFound}</div>;
  return (
    <div role="alert" className="flex items-center gap-3 rounded-xl border border-line px-[14px] py-3 font-mono text-[11px] text-dim">
      <span className="flex-1">couldn't reach the archive — check your connection.</span>
      <button type="button" onClick={onRetry} aria-label="Retry" title="Retry" className="grid size-8 place-items-center rounded-md border border-line2 text-signal">
        <RotateCw size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  );
}
