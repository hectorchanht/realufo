// The media console: one header, three bodies. The visitor picks the body
// (Simple / DJ deck / Walkman) with the Palette button; the choice is
// remembered on this device (ru:media-skin). P1–P4 presets apply a whole
// look in one tap and are shared by all three styles.
// Spec: docs/superpowers/specs/2026-10-04-media-dj-console-design.md
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Check, Disc3, List, Palette, Save } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { chip, ico, off, on } from "../ImageTools";
import type { ImageAdjust } from "../ImageTools";
import type { MediaView } from "../../lib/mediaView";
import type { MediaSkin } from "../../lib/mediaSkin";
import { SKINS } from "../../lib/mediaSkin";
import { loadPresets, presetMatches, savePresets } from "../../lib/mediaPresets";
import type { Preset } from "../../lib/mediaPresets";
import type { VideoCtl } from "../../lib/useVideoTransport";
import { useOverlay } from "../../overlays/OverlayProvider";
import { DeskLabel } from "./DeskLabel";
import { SimpleBody } from "./SimpleBody";
import { ChabanBody } from "./ChabanBody";

export interface ConsoleProps {
  media: "image" | "video";
  skin: MediaSkin;
  onSkin(s: MediaSkin): void;
  adjust: ImageAdjust;
  onAdjust(a: ImageAdjust): void;
  lens: boolean;
  onLens(b: boolean): void;
  mag: number;
  onMag(m: number): void;
  view: MediaView;
  onView(v: MediaView): void;
  /** Frame zoom by a factor around the panel centre. */
  onZoom(f: number): void;
  ruler: boolean;
  onRuler(b: boolean): void;
  motion: boolean;
  onMotion?: (b: boolean) => void;
  /** Hold-to-compare: true while the unfiltered picture shows. */
  compare: boolean;
  onCompare(b: boolean): void;
  /** Copy a link to this view (images). */
  onLink?: () => void;
  /** Copy a link to the current moment (video). */
  onMomentLink?: () => void;
  /** Save the picture as seen, as PNG (images). */
  onSave?: () => Promise<void>;
  /** Video transport state for the deck (null for images). */
  video: VideoCtl | null;
  /** The "how to use" chip (MediaHelp), last in the Simple tool row. */
  help: ReactNode;
  /** Name of the preset the current setup matches, if any (cassette window). */
  presetName?: string;
}

const SKIN_ICONS: Record<MediaSkin, LucideIcon> = { simple: List, chaban: Disc3 };

/** Palette button: opens the style menu (icon + name, current ticked). */
function SkinPicker({ skin, onPick }: { skin: MediaSkin; onPick(s: MediaSkin): void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open ]);
  return (
    <span ref={ref} className="relative">
      <button
        type="button"
        aria-label="Console style"
        aria-expanded={open}
        title={`Console style: ${SKINS.find((s) => s.key === skin)?.name}`}
        onClick={() => setOpen(!open)}
        className={`${chip} ${open ? on : off}`}
      >
        <Palette {...ico} />
        <DeskLabel>{SKINS.find((s) => s.key === skin)?.name}</DeskLabel>
      </button>
      {open && (
        <span className="absolute left-0 top-full z-30 pt-1.5">
          <span className="block w-[228px] rounded-xl border border-line2 bg-bg2 p-1.5 shadow-[0_6px_24px_rgba(0,0,0,.45)]">
            {SKINS.map((s) => {
              const Icon = SKIN_ICONS[s.key];
              const current = s.key === skin;
              return (
                <button
                  key={s.key}
                  type="button"
                  aria-pressed={current}
                  onClick={() => {
                    onPick(s.key);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left active:scale-[.99]"
                >
                  <Icon size={18} strokeWidth={1.75} aria-hidden="true" className={current ? "text-signal" : "text-dim"} />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[12.5px] font-medium ${current ? "text-ink" : "text-dim"}`}>{s.name}</span>
                    <span className="block truncate text-[10.5px] text-faint">{s.blurb}</span>
                  </span>
                  {current && <Check size={16} aria-hidden="true" className="flex-none text-signal" />}
                </button>
              );
            })}
          </span>
        </span>
      )}
    </span>
  );
}

/** P1–P4: tap applies; the floppy arms saving (slots pulse, tap one to store the current setup). */
function PresetRow({
  presets,
  onApply,
  arming,
  onArm,
  adjust,
  mag,
  motion,
  media,
}: {
  presets: Preset[];
  onApply(p: Preset): void;
  arming: boolean;
  onArm(): void;
  adjust: ImageAdjust;
  mag: number;
  motion: boolean;
  media: "image" | "video";
}) {
  return (
    <>
      {presets.map((p) => {
        const lit = !arming && presetMatches(p, adjust, mag, motion, media);
        return (
          <button
            key={p.slot}
            type="button"
            aria-label={arming ? `Save to preset ${p.slot}` : `Preset ${p.slot}: ${p.name}`}
            aria-pressed={lit}
            title={arming ? `Save the current setup to P${p.slot}` : `P${p.slot} · ${p.name} (${p.slot})`}
            onClick={() => onApply(p)}
            className={`${chip} ${lit ? on : off} ${arming ? "animate-pulse border-signal" : ""}`}
          >
            P{p.slot}
          </button>
        );
      })}
      <button
        type="button"
        aria-label={arming ? "Cancel saving" : "Save the current setup to a preset slot"}
        aria-pressed={arming}
        title={arming ? "Cancel" : "Save the current setup to a preset slot"}
        onClick={onArm}
        className={`${chip} ${arming ? on : off}`}
      >
        <Save {...ico} />
        <DeskLabel>Save</DeskLabel>
      </button>
    </>
  );
}

export function MediaConsole(props: ConsoleProps) {
  const { media, skin, onSkin, adjust, onAdjust, mag, onMag, motion, onMotion } = props;
  const [presets, setPresets] = useState<Preset[]>(loadPresets);
  const [arming, setArming] = useState(false);
  const { toast } = useOverlay();
  const activePreset = arming ? undefined : presets.find((q) => presetMatches(q, adjust, mag, motion, media));
  const childProps = { ...props, presetName: activePreset?.name };

  function apply(p: Preset) {
    if (arming) {
      const next = presets.map((q) =>
        q.slot === p.slot
          ? { ...q, name: "Your setup", adjust: { ...adjust }, mag, motion: media === "video" ? motion : false }
          : q,
      );
      setPresets(next);
      savePresets(next);
      setArming(false);
      toast(`Saved to P${p.slot}`);
      return;
    }
    onAdjust({ ...p.adjust });
    onMag(p.mag);
    if (media === "video" && onMotion) onMotion(p.motion);
  }

  // 1–4 apply presets while the console is open
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 4) {
        const p = presets[n - 1];
        if (p) {
          apply(p);
          e.preventDefault();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presets, arming, adjust, mag, motion]);

  return (
    <div>
      {/* console header: style picker + presets, shared by all three bodies */}
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <SkinPicker skin={skin} onPick={onSkin} />
        <span className="mx-1 h-4 w-px bg-line2" aria-hidden="true" />
        <PresetRow
          presets={presets}
          onApply={apply}
          arming={arming}
          onArm={() => setArming(!arming)}
          adjust={adjust}
          mag={mag}
          motion={motion}
          media={media}
        />
      </div>
      {skin === "simple" && <SimpleBody {...childProps} />}
      {skin === "chaban" && <ChabanBody {...childProps} />}
    </div>
  );
}
