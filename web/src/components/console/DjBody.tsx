// DJ deck console body: faders · square pads (effects, tools) · the deck
// (click wheel + magnifier knob). For studying footage: hands stay on the
// wheel to scrub frame by frame while the other hand mixes effects.
// Side by side ≥ 900px; stacked on phones with the wheel first (most used).
import { useState } from "react";
import {
  Activity, Camera, Contrast, Download, Droplet, Eye, ImageDown, Link,
  LoaderCircle, MessageSquarePlus, Moon, RotateCw, Ruler, Sun, TriangleAlert,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { adjustFilter } from "../ImageTools";
import { Fader } from "./Fader";
import { DeckColumn } from "./deck";
import { EFFECTS } from "./effects";
import type { ConsoleProps } from "./MediaConsole";

/** Square press pad (茶盤: square = press). On = sunk 2px and lit. */
export function Pad({
  label, title, Icon, active, onTap, hold,
}: {
  label: string; title: string; Icon: LucideIcon; active?: boolean;
  onTap(held?: boolean): void; hold?: boolean;
}) {
  const holdProps = hold
    ? {
        onPointerDown: (e: React.PointerEvent) => {
          e.currentTarget.setPointerCapture?.(e.pointerId);
          onTap(true);
        },
        onPointerUp: () => onTap(false),
        onPointerCancel: () => onTap(false),
        onLostPointerCapture: () => onTap(false),
        onKeyDown: (e: React.KeyboardEvent) => (e.key === " " || e.key === "Enter") && onTap(true),
        onKeyUp: () => onTap(false),
        onBlur: () => onTap(false),
        onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
      }
    : { onClick: () => onTap() };
  return (
    <button
      type="button"
      aria-label={hold ? `${label} (hold)` : label}
      aria-pressed={hold ? undefined : !!active}
      title={title}
      {...holdProps}
      className={`grid min-h-[52px] min-w-[52px] place-items-center rounded-[8px] border px-2 py-2 transition-all duration-150 ease-out active:translate-y-[2px] motion-reduce:transition-none ${
        active ? "translate-y-[2px] border-signal bg-[var(--signal-dim)] text-signal" : "border-line2 text-dim"
      } ${hold ? "touch-none select-none" : ""}`}
    >
      <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <h3 className="mb-1.5 font-mono text-[9px] uppercase tracking-[.8px] text-faint">{children}</h3>;
}

export function DjBody(p: ConsoleProps) {
  const { adjust, onAdjust, view, onView, ruler, onRuler, motion, onMotion, compare, onCompare, video } = p;
  const [saving, setSaving] = useState<"idle" | "busy" | "failed">("idle");
  const changed = adjustFilter(adjust) !== "";

  async function saveImage() {
    if (!p.onSave || saving === "busy") return;
    setSaving("busy");
    try {
      await p.onSave();
      setSaving("idle");
    } catch {
      setSaving("failed");
    }
  }
  function rotate() {
    onView({ ...view, rot: ((view.rot + 90) % 360) as typeof view.rot });
  }

  const faders = [
    { key: "brightness", label: "Brightness", Icon: Sun },
    { key: "contrast", label: "Contrast", Icon: Contrast },
    { key: "saturate", label: "Saturation", Icon: Droplet },
    { key: "gamma", label: "Shadows", Icon: Moon },
  ] as const;

  // --- deck press points live in ./deck (shared with the Walkman body) ---

  // --- tool pads ---
  const toolPads: { label: string; title: string; Icon: LucideIcon; active?: boolean; onTap(): void }[] = [
    { label: "Ruler", title: "Ruler: drag a line (pixels, % of width, angle)", Icon: Ruler, active: ruler, onTap: () => onRuler(!ruler) },
    ...(p.media === "video" && onMotion
      ? [{ label: "Motion", title: "Motion: what moved lights up, still areas go dark", Icon: Activity, active: motion, onTap: () => onMotion(!motion) }]
      : []),
    { label: "Rotate 90°", title: "Rotate 90° (R)", Icon: RotateCw, active: view.rot !== 0, onTap: rotate },
  ];
  if (p.media === "video" && video) {
    const v = video;
    toolPads.push(
      { label: "Save frame", title: "Save frame (C)", Icon: Camera, onTap: () => void v.grab("save") },
      { label: "Post frame", title: "Post frame to discussion", Icon: MessageSquarePlus, onTap: () => void v.grab("post") },
      { label: "Download video", title: "Download video", Icon: Download, onTap: v.download },
    );
    if (p.onMomentLink)
      toolPads.push({ label: "Copy link to this moment", title: "Copy link to this moment", Icon: Link, onTap: p.onMomentLink });
  } else {
    if (p.onSave)
      toolPads.push({
        label: saving === "failed" ? "Save failed, retry" : "Save view",
        title: "Save view (PNG, with filters + rotation)",
        Icon: saving === "busy" ? LoaderCircle : saving === "failed" ? TriangleAlert : ImageDown,
        onTap: () => void saveImage(),
      });
    if (p.onLink) toolPads.push({ label: "Copy link to this view", title: "Copy link to this view", Icon: Link, onTap: p.onLink });
  }

  return (
    <div className="flex flex-col gap-5 min-[900px]:flex-row min-[900px]:items-start">
      {/* faders */}
      <section aria-label="Faders" className="order-2 min-[900px]:order-1">
        <SectionTitle>Faders</SectionTitle>
        <div className="flex justify-center gap-4">
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
      </section>

      {/* pads */}
      <section aria-label="Pads" className="order-3 min-[900px]:order-2 min-w-0 flex-1">
        <SectionTitle>Effects</SectionTitle>
        <div className="mb-4 grid grid-cols-4 gap-2">
          {EFFECTS.map((e) => (
            <Pad key={e.id} label={e.label} title={e.label} Icon={e.Icon} active={e.active(adjust)} onTap={() => onAdjust(e.next(adjust))} />
          ))}
          {changed && (
            <Pad label="Original" title="Hold to see the original (\)" Icon={Eye} active={compare} hold onTap={(held) => onCompare(!!held)} />
          )}
        </div>
        <SectionTitle>Tools</SectionTitle>
        <div className="grid grid-cols-3 gap-2">
          {toolPads.map((t) => (
            <Pad key={t.label} label={t.label} title={t.title} Icon={t.Icon} active={t.active} onTap={t.onTap} />
          ))}
        </div>
      </section>

      {/* deck */}
      <section aria-label="Deck" className="order-1 min-[900px]:order-3">
        <SectionTitle>Deck</SectionTitle>
        <DeckColumn p={p} />
      </section>
    </div>
  );
}
