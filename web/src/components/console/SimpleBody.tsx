// Simple console body: today's panel, tidied. Effect chips, tool chips,
// horizontal sliders, magnifier strength chips, video speed / loop / A–B
// chips — grouped by what the visitor wants to do (茶盤: each tool has its
// place). The zoom cluster reads: Zoom out → Zoom in → Reset zoom, the same
// parent-then-modifier pattern as Lens → Lens magnification.
import { useState } from "react";
import {
  Activity, Contrast, Droplet, Eye, FlipHorizontal2, ImageDown, Link, LoaderCircle, Moon, Repeat, Repeat1,
  RotateCcw, RotateCw, Ruler, Search, Shrink, Sun, TriangleAlert, X, ZoomIn, ZoomOut,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { DEFAULT_ADJUST, LENS_MAGS, adjustFilter, chip, ico, off, on } from "../ImageTools";
import { DEFAULT_VIEW, MAX_ZOOM } from "../../lib/mediaView";
import { DeskLabel } from "./DeskLabel";
import type { ImageAdjust } from "../ImageTools";
import type { MediaView } from "../../lib/mediaView";
import { SPEEDS } from "../../lib/useVideoTransport";
import type { VideoCtl } from "../../lib/useVideoTransport";
import { EFFECTS } from "./effects";
import type { ConsoleProps } from "./MediaConsole";

const SLIDERS: { key: "brightness" | "contrast" | "saturate" | "gamma"; label: string; Icon: LucideIcon }[] = [
  { key: "brightness", label: "Brightness", Icon: Sun },
  { key: "contrast", label: "Contrast", Icon: Contrast },
  { key: "saturate", label: "Saturation", Icon: Droplet },
  { key: "gamma", label: "Shadows", Icon: Moon },
];

/** Thin divider between tool groups (茶盤: each group its own place). */
export function GroupDiv() {
  return <span className="mx-1 h-4 w-px bg-line2" aria-hidden="true" />;
}

function ToolRow(p: {
  lens: boolean; onLens(b: boolean): void; mag: number; onMag(m: number): void;
  view: MediaView; onView(v: MediaView): void; onZoom(f: number): void;
  ruler: boolean; onRuler(b: boolean): void; motion: boolean; onMotion?: (b: boolean) => void;
  onLink?: () => void; onSave?: () => Promise<void>;
  compare: boolean; onCompare(b: boolean): void;
  changed: boolean; onResetLooks(a: ImageAdjust): void; adjust: ImageAdjust;
  help: ConsoleProps["help"];
}) {
  const { view } = p;
  const [saving, setSaving] = useState<"idle" | "busy" | "failed">("idle");
  async function save() {
    if (!p.onSave || saving === "busy") return;
    setSaving("busy");
    try {
      await p.onSave();
      setSaving("idle");
    } catch {
      setSaving("failed");
    }
  }
  const nextMag = LENS_MAGS[(LENS_MAGS.indexOf(p.mag) + 1) % LENS_MAGS.length];
  return (
    <div className="mb-2.5 flex flex-wrap items-center gap-2">
      {/* look closer: lens + frame zoom */}
      <button type="button" aria-label="Lens" aria-pressed={p.lens} onClick={() => p.onLens(!p.lens)} title="Lens (L)" className={`${chip} ${p.lens ? on : off}`}>
        <Search {...ico} />
        <DeskLabel>Lens</DeskLabel>
      </button>
      {p.lens && (
        <button
          type="button"
          aria-label={`Lens magnification ${p.mag}×`}
          onClick={() => p.onMag(nextMag)}
          title="Shift+wheel or - / =  changes it"
          className={`${chip} ${on}`}
        >
          {p.mag}×
        </button>
      )}
      <GroupDiv />
      <button type="button" aria-label="Zoom out" title="Zoom out" disabled={view.z <= 1} onClick={() => p.onZoom(1 / 1.5)} className={`${chip} ${off} disabled:opacity-40`}>
        <ZoomOut {...ico} />
        <DeskLabel>Zoom out</DeskLabel>
      </button>
      <button type="button" aria-label="Zoom in" title="Zoom in" disabled={view.z >= MAX_ZOOM} onClick={() => p.onZoom(1.5)} className={`${chip} ${off} disabled:opacity-40`}>
        <ZoomIn {...ico} />
        <DeskLabel>Zoom in</DeskLabel>
      </button>
      {view.z > 1 && (
        <button type="button" aria-label="Reset zoom" title="Reset zoom (0)" onClick={() => p.onView({ ...view, z: 1, x: 0, y: 0 })} className={`${chip} ${on}`}>
          <Shrink {...ico} />
          {view.z.toFixed(1)}×
          <X {...ico} size={12} />
        </button>
      )}
      <GroupDiv />
      {/* turn it */}
      <button
        type="button"
        aria-label="Rotate 90°"
        title="Rotate 90° (R)"
        onClick={() => p.onView({ ...DEFAULT_VIEW, flip: view.flip, rot: ((view.rot + 90) % 360) as MediaView["rot"] })}
        className={`${chip} ${view.rot ? on : off}`}
      >
        <RotateCw {...ico} />
        <DeskLabel>Rotate</DeskLabel>
        {view.rot ? `${view.rot}°` : ""}
      </button>
      <button
        type="button"
        aria-label="Flip"
        aria-pressed={view.flip}
        title="Flip (F)"
        onClick={() => p.onView({ ...view, flip: !view.flip })}
        className={`${chip} ${view.flip ? on : off}`}
      >
        <FlipHorizontal2 {...ico} />
        <DeskLabel>Flip</DeskLabel>
      </button>
      <GroupDiv />
      {/* measure and spot */}
      <button type="button" aria-label="Ruler" aria-pressed={p.ruler} title="Ruler: drag a line (pixels, % of width, angle)" onClick={() => p.onRuler(!p.ruler)} className={`${chip} ${p.ruler ? on : off}`}>
        <Ruler {...ico} />
        <DeskLabel>Ruler</DeskLabel>
      </button>
      {p.onMotion && (
        <button
          type="button"
          aria-label="Motion"
          aria-pressed={p.motion}
          title="Motion: what moved lights up, still areas go dark"
          onClick={() => p.onMotion?.(!p.motion)}
          className={`${chip} ${p.motion ? on : off}`}
        >
          <Activity {...ico} />
          <DeskLabel>Motion</DeskLabel>
        </button>
      )}
      <GroupDiv />
      {/* keep or share */}
      {p.onLink && (
        <button type="button" aria-label="Copy link to this view" title="Copy link to this view" onClick={p.onLink} className={`${chip} ${off}`}>
          <Link {...ico} />
          <DeskLabel>Copy link</DeskLabel>
        </button>
      )}
      {p.onSave && (
        <button
          type="button"
          aria-label={saving === "failed" ? "Save failed, retry" : "Save view"}
          title={saving === "failed" ? "Save failed — retry" : "Save view (PNG, with filters + rotation)"}
          onClick={() => void save()}
          disabled={saving === "busy"}
          className={`${chip} ${saving === "failed" ? "border-amber text-amber" : off}`}
        >
          {saving === "busy" ? <LoaderCircle {...ico} className="animate-spin" /> : saving === "failed" ? <TriangleAlert {...ico} /> : <ImageDown {...ico} />}
          <DeskLabel>Save</DeskLabel>
        </button>
      )}
      {p.changed && (
        // press and hold (pointer, or Space/Enter on the focused chip): see the file as it is, no filters
        <button
          type="button"
          aria-label="Hold to see the original"
          aria-pressed={p.compare}
          title="Hold to see the original (\)"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture?.(e.pointerId);
            p.onCompare(true);
          }}
          onPointerUp={() => p.onCompare(false)}
          onPointerCancel={() => p.onCompare(false)}
          onLostPointerCapture={() => p.onCompare(false)}
          onKeyDown={(e) => (e.key === " " || e.key === "Enter") && p.onCompare(true)}
          onKeyUp={() => p.onCompare(false)}
          onBlur={() => p.onCompare(false)}
          onContextMenu={(e) => e.preventDefault()}
          className={`${chip} ${p.compare ? on : off} touch-none select-none`}
        >
          <Eye {...ico} />
          <DeskLabel>Original</DeskLabel>
        </button>
      )}
      {p.help}
      {p.changed && (
        <button type="button" aria-label="Reset filters" title="Reset filters" onClick={() => p.onResetLooks(DEFAULT_ADJUST)} className={`${chip} ${off} ml-auto`}>
          <RotateCcw {...ico} />
          <DeskLabel>Reset</DeskLabel>
        </button>
      )}
    </div>
  );
}

function SpeedRow({ video }: { video: VideoCtl }) {
  return (
    <div className="mb-2.5 flex flex-wrap items-center gap-2">
      {SPEEDS.map((s) => (
        <button key={s} type="button" aria-label={`Speed ${s}×`} aria-pressed={video.rate === s} title="Speed ([ ])" onClick={() => video.setRate(s)} className={`${chip} ${video.rate === s ? on : off}`}>
          {s}×
        </button>
      ))}
      <GroupDiv />
      <button
        type="button"
        aria-label="Loop"
        aria-pressed={video.loop}
        title="Loop"
        onClick={video.toggleLoop}
        className={`${chip} ${video.loop ? on : off}`}
      >
        <Repeat {...ico} />
        <DeskLabel>Loop</DeskLabel>
      </button>
      <button type="button" aria-label={video.abLabel} aria-pressed={video.ab?.b !== undefined} title={`${video.abLabel} (A)`} onClick={video.markAb} className={`${chip} ${video.ab ? on : off}`}>
        <Repeat1 {...ico} />
        {video.ab && (video.ab.b === undefined ? "B?" : <X {...ico} size={12} />)}
      </button>
    </div>
  );
}

export function SimpleBody(p: ConsoleProps) {
  const changed = adjustFilter(p.adjust) !== "";
  return (
    <div>
      <ToolRow
        lens={p.lens} onLens={p.onLens} mag={p.mag} onMag={p.onMag}
        view={p.view} onView={p.onView} onZoom={p.onZoom}
        ruler={p.ruler} onRuler={p.onRuler} motion={p.motion} onMotion={p.onMotion}
        onLink={p.onLink} onSave={p.onSave}
        compare={p.compare} onCompare={p.onCompare}
        changed={changed} onResetLooks={p.onAdjust} adjust={p.adjust}
        help={p.help}
      />
      {p.video && <SpeedRow video={p.video} />}
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        {EFFECTS.map((e) => {
          const active = e.active(p.adjust);
          return (
            <button
              key={e.id}
              type="button"
              aria-label={e.label}
              aria-pressed={active}
              title={e.label}
              onClick={() => p.onAdjust(e.next(p.adjust))}
              className={`${chip} ${active ? on : off}`}
            >
              <e.Icon {...ico} />
              <DeskLabel>{e.label}</DeskLabel>
            </button>
          );
        })}
      </div>
      <div className="grid gap-x-5 gap-y-2 min-[600px]:grid-cols-2">
        {SLIDERS.map((s) => (
          <label key={s.key} title={s.label} className="flex items-center gap-2.5 font-mono text-[9.5px] tracking-[.4px] text-faint">
            <s.Icon {...ico} className="flex-none" />
            <input
              type="range"
              aria-label={s.label}
              min={0}
              max={200}
              value={p.adjust[s.key]}
              onChange={(e) => p.onAdjust({ ...p.adjust, [s.key]: Number(e.target.value) })}
              className="min-w-0 flex-1 accent-[var(--signal)]"
            />
            <span className="w-8 flex-none text-right text-dim">{p.adjust[s.key]}%</span>
          </label>
        ))}
      </div>
    </div>
  );
}
