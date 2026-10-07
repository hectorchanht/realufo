// The deck, shared by the DJ and Walkman bodies: click wheel + magnifier
// knob (+ loop toggle and speed readout for video).
import { Gauge, Pause, Play, Repeat, Repeat1, RotateCw, Search, Shrink, StepBack, StepForward, ZoomIn, ZoomOut } from "lucide-react";
import { LENS_MAGS, chip, ico, off, on } from "../ImageTools";
import { formatMoment } from "../../lib/recordMedia";
import { ClickWheel } from "./ClickWheel";
import type { WheelPress } from "./ClickWheel";
import { Knob } from "./Knob";
import type { ConsoleProps } from "./MediaConsole";

export function deckPress(p: ConsoleProps): { center: WheelPress; top: WheelPress; right: WheelPress; bottom: WheelPress; left: WheelPress } {
  const { view, onView, onZoom, lens, onLens, video } = p;
  const rotate = () => onView({ ...view, rot: ((view.rot + 90) % 360) as typeof view.rot });
  if (p.media === "video" && video) {
    return {
      center: { label: video.playing ? "Pause" : "Play", title: "Play / pause (Space)", Icon: video.playing ? Pause : Play, onPress: video.togglePlay, active: video.playing },
      left: { label: "Previous frame", title: "Previous frame (,)", Icon: StepBack, onPress: () => video.stepFrame(-1) },
      right: { label: "Next frame", title: "Next frame (.)", Icon: StepForward, onPress: () => video.stepFrame(1) },
      top: { label: `Speed ${video.rate}×`, title: "Speed", Icon: Gauge, onPress: video.cycleRate },
      bottom: { label: video.abLabel, title: `${video.abLabel} (A)`, Icon: Repeat1, onPress: video.markAb, active: !!video.ab },
    };
  }
  return {
    center: { label: "Full view", title: "Full view (0)", Icon: Shrink, onPress: () => onView({ ...view, z: 1, x: 0, y: 0 }) },
    left: { label: "Zoom out", title: "Zoom out", Icon: ZoomOut, onPress: () => onZoom(1 / 1.5) },
    right: { label: "Zoom in", title: "Zoom in", Icon: ZoomIn, onPress: () => onZoom(1.5) },
    top: { label: "Lens", title: "Lens (L)", Icon: Search, onPress: () => onLens(!lens), active: lens },
    bottom: { label: "Rotate 90°", title: "Rotate 90° (R)", Icon: RotateCw, onPress: rotate },
  };
}

export function DeckColumn({ p }: { p: ConsoleProps }) {
  const { mag, onMag, onZoom, view, video } = p;
  const onScrub = (dir: 1 | -1) => {
    if (p.media === "video" && video) video.stepFrame(dir);
    else onZoom(Math.exp((dir * 12) / 180)); // zoom ×= exp(Δ°/180)
  };
  const valueText = p.media === "video" && video ? formatMoment(video.t, true) : `Zoom ${view.z.toFixed(1)}×`;
  return (
    <div className="flex items-start justify-center gap-6">
      <ClickWheel press={deckPress(p)} onScrub={onScrub} valueText={valueText} label={p.media === "video" ? "Scrub frames" : "Zoom wheel"} />
      <div className="flex flex-col items-center gap-2">
        <Knob value={mag} steps={LENS_MAGS} onChange={onMag} label="Lens" />
        {p.media === "video" && video && (
          <>
            <button
              type="button"
              aria-label="Loop"
              aria-pressed={video.loop}
              title="Loop"
              onClick={video.toggleLoop}
              className={`${chip} ${video.loop ? on : off}`}
            >
              <Repeat {...ico} />
            </button>
            <span className="font-mono text-[10px] tabular-nums text-dim">{video.rate}×</span>
          </>
        )}
      </div>
    </div>
  );
}
