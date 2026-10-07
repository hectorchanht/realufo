// Walkman console body: one compact body for one-thumb phone use. Cassette
// window on top (what is on), faders, the Wakeman keyboard (white keys =
// effects, black keys = tools), the click wheel under the cassette window on
// phones, on the right of the body on desktop. A coloured stripe along the
// top edge, site accent.
import {
  Activity, Camera, Contrast, Download, Droplet, Eye, ImageDown, Link,
  MessageSquarePlus, Moon, RotateCw, Ruler, Sun,
} from "lucide-react";
import { formatMoment } from "../../lib/recordMedia";
import { Fader } from "./Fader";
import { DeckColumn } from "./deck";
import { EFFECTS } from "./effects";
import { WakemanKeyboard } from "./Keyboard";
import type { KeyDef } from "./Keyboard";
import { CassetteWindow } from "./CassetteWindow";
import type { ConsoleProps } from "./MediaConsole";

export function WalkmanBody(p: ConsoleProps) {
  const { adjust, onAdjust, view, onView, ruler, onRuler, motion, onMotion, compare, onCompare, video, presetName } = p;

  function rotate() {
    onView({ ...view, rot: ((view.rot + 90) % 360) as typeof view.rot });
  }

  const faders = [
    { key: "brightness", label: "Brightness", Icon: Sun },
    { key: "contrast", label: "Contrast", Icon: Contrast },
    { key: "saturate", label: "Saturation", Icon: Droplet },
    { key: "gamma", label: "Shadows", Icon: Moon },
  ] as const;

  const white: KeyDef[] = [
    ...EFFECTS.map((e) => ({
      id: e.id, label: e.label, title: e.label, Icon: e.Icon,
      active: e.active(adjust), onTap: () => onAdjust(e.next(adjust)),
    })),
    {
      id: "original", label: "Original", title: "Hold to see the original (\\)", Icon: Eye,
      active: compare, hold: true, onTap: (held?: boolean) => onCompare(!!held),
    },
  ];

  const black: KeyDef[] = [
    { id: "ruler", label: "Ruler", title: "Ruler: drag a line (pixels, % of width, angle)", Icon: Ruler, active: ruler, onTap: () => onRuler(!ruler) },
    ...(p.media === "video" && onMotion
      ? [{ id: "motion", label: "Motion", title: "Motion: what moved lights up, still areas go dark", Icon: Activity, active: motion, onTap: () => onMotion(!motion) }]
      : []),
    { id: "turn", label: "Rotate 90°", title: "Rotate 90° (R)", Icon: RotateCw, active: view.rot !== 0, onTap: rotate },
    ...(p.media === "video" && video
      ? [
          { id: "save", label: "Save frame", title: "Save frame (C)", Icon: Camera, active: false, onTap: () => void video.grab("save") },
          { id: "post", label: "Post frame", title: "Post frame to discussion", Icon: MessageSquarePlus, active: false, onTap: () => void video.grab("post") },
          { id: "download", title: "Download video", label: "Download video", Icon: Download, active: false, onTap: video.download },
          ...(p.onMomentLink ? [{ id: "link", label: "Copy link to this moment", title: "Copy link to this moment", Icon: Link, active: false, onTap: p.onMomentLink }] : []),
        ]
      : [
          ...(p.onSave ? [{ id: "save", label: "Save view", title: "Save view (PNG, with filters + rotation)", Icon: ImageDown, active: false, onTap: () => void p.onSave!() }] : []),
          ...(p.onLink ? [{ id: "link", label: "Copy link to this view", title: "Copy link to this view", Icon: Link, active: false, onTap: p.onLink }] : []),
        ]),
  ];

  const main = p.media === "video" && video ? formatMoment(video.t, true) : `${view.z.toFixed(1)}×`;
  const sub = p.media === "video" && video ? `${presetName ?? "No preset"} · ${video.rate}× speed` : (presetName ?? "No preset");
  const spinning = p.media === "video" && !!video?.playing;

  return (
    <div className="rounded-[16px] border border-line2 bg-surface">
      <div aria-hidden="true" className="h-[3px] rounded-t-[16px] bg-[var(--signal)]" />
      <div className="flex flex-col gap-4 p-3.5">
        <CassetteWindow main={main} sub={sub} spinning={spinning} />
        <div className="flex flex-col gap-4 min-[700px]:flex-row min-[700px]:items-start">
          <div className="order-2 flex justify-center gap-4 min-[700px]:order-1">
            {faders.map((f) => (
              <Fader
                key={f.key}
                label={f.label}
                Icon={f.Icon}
                value={adjust[f.key]}
                onChange={(v) => onAdjust({ ...adjust, [f.key]: v })}
                onReset={() => onAdjust({ ...adjust, [f.key]: 100 })}
              />
            ))}
          </div>
          <div className="order-3 min-w-0 flex-1 min-[700px]:order-2">
            <WakemanKeyboard white={white} black={black} />
          </div>
          <div className="order-1 min-[700px]:order-3">
            <DeckColumn p={p} />
          </div>
        </div>
      </div>
    </div>
  );
}
