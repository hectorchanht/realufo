// Notification settings (spec Phase 2c): on/off, what to hear about, what you follow.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useBootstrap } from "../api/queries";
import { useSetPageTitle } from "../lib/pageTitle";
import { useOverlay } from "../overlays/OverlayProvider";
import { currentSub, disablePush, enablePush, ENABLE_MSG } from "../lib/push";

type Prefs = { replies: boolean; new_files: boolean; daily: boolean };
type Follow = { kind: string; key: string; src: string; title: string; url: string };
const PREF_LABELS: [keyof Prefs, string][] = [
  ["replies", "Replies to my posts"],
  ["new_files", "All new files"],
  ["daily", "Daily pick"],
];
const row = "flex min-h-[48px] items-center justify-between gap-3 border-b border-line py-2 font-mono text-[13px] text-ink";

export default function Notifications() {
  useSetPageTitle("NOTIFICATIONS", "What you hear about");
  const pushOn = !!useBootstrap().data?.features?.push;
  const { toast } = useOverlay();
  const qc = useQueryClient();
  const [endpoint, setEndpoint] = useState<string | null | undefined>(undefined); // undefined = still checking
  useEffect(() => {
    void currentSub().then((s) => setEndpoint(s?.endpoint ?? null));
  }, []);
  const meKey = ["pushMe", endpoint];
  const { data: me } = useQuery({
    queryKey: meKey,
    queryFn: () => api.get<{ prefs: Prefs | null; follows: Follow[] }>(`/api/push/me${endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : ""}`),
    enabled: pushOn && endpoint !== undefined,
  });

  if (!pushOn) return <p className="py-10 text-center font-mono text-[12px] text-faint">Notifications aren't available yet.</p>;

  const enabled = !!endpoint && !!me?.prefs;
  async function toggleEnabled() {
    try {
      if (enabled) {
        await disablePush();
        setEndpoint(null);
        return;
      }
      const r = await enablePush();
      if (r !== "ok") return toast(ENABLE_MSG[r]);
      setEndpoint((await currentSub())?.endpoint ?? null);
      // Same endpoint = same query key: re-read so the switch shows the re-saved sub.
      void qc.invalidateQueries({ queryKey: ["pushMe"] });
    } catch {
      toast("Could not update — try again"); // e.g. subscribe() on a browser without a push service
    }
  }
  // Failed writes (offline, a followed target since deleted) toast instead of rejecting unhandled.
  async function update(path: string, body: unknown) {
    try {
      await api.post(path, body);
    } catch {
      toast("Could not update — try again");
    }
    void qc.invalidateQueries({ queryKey: meKey });
  }
  const setPref = (k: keyof Prefs, v: boolean) => update("/api/push/prefs", { endpoint, [k]: v });
  const unfollow = (f: Follow) => update("/api/follows", { kind: f.kind, key: f.key, on: false });

  return (
    <div data-screen="notifications" className="mx-auto max-w-[560px]">
      <label className={row}>
        Notifications on this device
        <input type="checkbox" role="switch" checked={enabled} onChange={toggleEnabled} />
      </label>
      {enabled &&
        PREF_LABELS.map(([k, label]) => (
          <label key={k} className={row}>
            {label}
            <input type="checkbox" role="switch" aria-label={label} checked={!!me?.prefs?.[k]} onChange={(e) => void setPref(k, e.target.checked)} />
          </label>
        ))}
      <h2 className="mb-1 mt-6 font-mono text-[11px] font-semibold tracking-[.4px] text-faint">FOLLOWING</h2>
      {!me?.follows.length && <p className="py-3 font-mono text-[12px] text-faint">Tap the bell on a file, thread, case or hub to follow it.</p>}
      <ul>
        {me?.follows.map((f) => (
          <li key={`${f.kind}:${f.key}`} className={row}>
            <Link to={f.url} className="min-w-0 flex-1 truncate hover:text-signal">
              {f.title}
            </Link>
            <button
              type="button"
              onClick={() => void unfollow(f)}
              aria-label={`Stop following ${f.title}`}
              title="Stop following"
              className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[10px] text-dim hover:text-signal"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
