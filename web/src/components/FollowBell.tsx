// Bell on doc/thread/case/hub pages (spec Phase 2c). First tap turns notifications on
// (the permission prompt comes from this tap only), then follows the page.
import { useState } from "react";
import { Bell, BellRing } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useBootstrap } from "../api/queries";
import { useOverlay } from "../overlays/OverlayProvider";
import { enablePush, ENABLE_MSG } from "../lib/push";

export type FollowKind = "thread" | "record" | "case" | "hub";

export function FollowBell(props: { kind: FollowKind; id: string }) {
  // Outer gate: screens render this under test harnesses without push (or an overlay provider).
  return useBootstrap().data?.features?.push ? <Bell_ {...props} /> : null;
}

function Bell_({ kind, id }: { kind: FollowKind; id: string }) {
  const qc = useQueryClient();
  const { toast } = useOverlay();
  const [busy, setBusy] = useState(false);
  const key = ["follow", kind, id];
  const { data } = useQuery({
    queryKey: key,
    queryFn: () => api.get<{ following: boolean }>(`/api/follows?${new URLSearchParams({ kind, key: id })}`),
  });
  const following = !!data?.following;

  async function tap() {
    setBusy(true);
    try {
      if (!following) {
        const r = await enablePush();
        if (r !== "ok") return toast(ENABLE_MSG[r]);
      }
      const res = await api.post<{ following: boolean }>("/api/follows", { kind, key: id, on: !following });
      qc.setQueryData(key, res);
      toast(res.following ? "Following — you'll be notified" : "Unfollowed");
    } catch {
      toast("Could not update — try again");
    } finally {
      setBusy(false);
    }
  }

  const Icon = following ? BellRing : Bell;
  const label = following ? "Unfollow" : "Follow for notifications";
  return (
    <button
      type="button"
      onClick={tap}
      disabled={busy}
      aria-label={label}
      title={label}
      aria-pressed={following}
      className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[10px] border border-line text-dim hover:text-signal disabled:opacity-50"
      style={following ? { color: "var(--signal)" } : undefined}
    >
      <Icon size={17} aria-hidden="true" />
    </button>
  );
}
