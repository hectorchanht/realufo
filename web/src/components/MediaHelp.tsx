// "How to use" panel for the Doc media tools: every tool, grouped by what a
// visitor wants to do, in plain words, with its key (mouse + keyboard) or its
// gesture (touch screens). Rows for the other kind of file are left out.
// Hover shows it; a click pins it open (outside click / Esc closes).
import { useEffect, useId, useRef, useState } from "react";
import {
  Activity,
  ArrowLeftRight,
  Bookmark,
  Camera,
  CircleHelp,
  CornerUpLeft,
  Download,
  DropletOff,
  Eye,
  Flame,
  FlipHorizontal2,
  Focus,
  Gauge,
  Hand,
  ImageDown,
  Link,
  Map as MapIcon,
  Maximize,
  MessageSquarePlus,
  MoonStar,
  MousePointerClick,
  Palette,
  Play,
  Repeat,
  Repeat1,
  RotateCcw,
  RotateCw,
  Ruler,
  Search,
  Shrink,
  SlidersHorizontal,
  StepForward,
  Sun,
  SunMoon,
  VolumeX,
  WandSparkles,
  ZoomIn,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { chip, ico, off, on } from "./ImageTools";
import { DeskLabel } from "./console/DeskLabel";

type Kind = "image" | "video";
interface Row {
  Icon: LucideIcon;
  name: string;
  what: string;
  keys?: string[]; // mouse + keyboard
  touch?: string; // the phone gesture, if there is one
  only?: Kind;
  keyboardOnly?: boolean; // nothing to tap: hidden on touch screens
}

const HELP: { title: string; only?: Kind; rows: Row[] }[] = [
  {
    title: "Look closer",
    rows: [
      { Icon: ZoomIn, name: "Zoom in or out", what: "Use the zoom buttons, or zoom right where you point.", keys: ["Ctrl/⌘ + scroll"], touch: "Pinch" },
      { Icon: MousePointerClick, name: "Quick zoom", what: "Zoom into a spot; do it again to go back.", keys: ["Double-click"], touch: "Double-tap" },
      { Icon: Hand, name: "Move around", what: "Drag the zoomed picture.", keys: ["Drag"], touch: "Drag" },
      { Icon: MapIcon, name: "Mini map", what: "While zoomed, the corner map shows where you are. Tap it to jump there." },
      { Icon: Shrink, name: "Full view", what: "Undo the zoom.", keys: ["0"] },
      { Icon: RotateCw, name: "Turn", what: "Turn the picture a quarter.", keys: ["R"] },
      { Icon: FlipHorizontal2, name: "Mirror", what: "Flip left and right.", keys: ["F"] },
    ],
  },
  {
    title: "Change the look",
    rows: [
      { Icon: SlidersHorizontal, name: "Adjust", what: "Opens the looks and sliders below." },
      { Icon: WandSparkles, name: "Enhance", what: "Stronger contrast and colour." },
      { Icon: SunMoon, name: "Invert", what: "Swap light and dark, like a heat camera's black-hot mode.", keys: ["I"] },
      { Icon: DropletOff, name: "Black and white", what: "Drop the colour so shapes stand out." },
      { Icon: MoonStar, name: "Night", what: "Bring out detail in dark night footage." },
      { Icon: Flame, name: "Heat colours", what: "Ironbow and Rainbow colour bright and dark areas, like a thermal camera." },
      { Icon: Focus, name: "Sharpen", what: "Crisper edges." },
      { Icon: Sun, name: "Sliders", what: "Fine-tune brightness, contrast, colour and shadows." },
      { Icon: Eye, name: "See the original", what: "Hold the eye button to see the file with no changes, to check nothing was added.", keys: ["hold \\"], touch: "Press and hold" },
      { Icon: RotateCcw, name: "Undo looks", what: "Back to the file as it came." },
    ],
  },
  {
    title: "Console styles",
    rows: [
      { Icon: Palette, name: "Console style", what: "Simple or DJ desk: two layouts for the same tools. Pick with the palette button; remembered on this device." },
      { Icon: Bookmark, name: "Presets P1–P4", what: "One tap applies a saved look. Tap the floppy, then a slot, to save the current setup there.", keys: ["1", "2", "3", "4"] },
    ],
  },
  {
    title: "Measure and spot",
    rows: [
      { Icon: Search, name: "Magnifier", what: "A round magnifier follows your pointer (on by default with a mouse).", keys: ["L"], touch: "Turn on, then drag" },
      { Icon: Search, name: "Magnifier strength", what: "2×, 3×, 5× or 8×: tap the number.", keys: ["-", "=", "Shift + scroll"] },
      { Icon: Ruler, name: "Ruler", what: "Drag a line to compare sizes and angles. Shows pixels, not real sizes: those aren't known." },
      { Icon: Activity, name: "Motion", what: "Things that move glow; still areas go dark.", only: "video" },
    ],
  },
  {
    title: "Share and save",
    rows: [
      { Icon: Link, name: "Copy link", what: "Share exactly this view: zoom, turn and looks.", only: "image" },
      { Icon: Link, name: "Copy link", what: "Share this moment, with the same view and looks.", only: "video" },
      { Icon: ImageDown, name: "Save picture", what: "Download it with your changes.", only: "image" },
      { Icon: Camera, name: "Save frame", what: "Download this frame with your changes.", keys: ["C"], only: "video" },
      { Icon: MessageSquarePlus, name: "Post frame", what: "Start a comment with this frame attached.", only: "video" },
      { Icon: Download, name: "Download video", what: "The original file.", only: "video" },
    ],
  },
  {
    title: "Play the video",
    only: "video",
    rows: [
      { Icon: Play, name: "Play or pause", what: "", keys: ["Space", "K"] },
      { Icon: StepForward, name: "Step one frame", what: "Back or forward one frame at a time.", keys: [",", "."] },
      { Icon: Gauge, name: "Speed", what: "From slow motion (0.1×) to 2×, in Adjust.", keys: ["[", "]"] },
      { Icon: Repeat, name: "Loop", what: "Play the clip over and over." },
      { Icon: Repeat1, name: "Loop a part", what: "Press for the start, again for the end, a third time to clear.", keys: ["A"] },
      { Icon: VolumeX, name: "Sound", what: "Mute or unmute.", keys: ["M"] },
      { Icon: Maximize, name: "Full screen", what: "Keeps your zoom and looks." },
    ],
  },
  {
    title: "Move between files",
    rows: [
      { Icon: ArrowLeftRight, name: "Next or previous file", what: "", keys: ["←", "→"], touch: "Swipe sideways" },
      { Icon: CornerUpLeft, name: "Go back", what: "", keys: ["Esc"], keyboardOnly: true },
    ],
  },
];

export function MediaHelp({ media, touch }: { media: Kind; touch: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();
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
  }, [open]);

  const groups = HELP.filter((g) => !g.only || g.only === media)
    .map((g) => ({ ...g, rows: g.rows.filter((r) => (!r.only || r.only === media) && !(touch && r.keyboardOnly)) }))
    .filter((g) => g.rows.length);

  return (
    // not `relative`: the panel spans the toolbar row (its positioned parent), so it fits on a phone
    <span ref={ref} className="group">
      <button
        type="button"
        aria-label="How to use the media tools"
        aria-expanded={open}
        aria-controls={id}
        title="How to use"
        onClick={() => setOpen(!open)}
        className={`${chip} ${open ? on : off}`}
      >
        <CircleHelp {...ico} />
        <DeskLabel>Help</DeskLabel>
      </button>
      {/* pt (not mt) keeps the gap inside the hover area, so the pointer can travel into the panel */}
      <div id={id} role="tooltip" className={`absolute left-0 right-0 top-full z-30 pt-1.5 ${open ? "block" : "hidden group-hover:block group-focus-within:block"}`}>
        <div className="grid max-h-[min(70vh,560px)] max-w-[640px] gap-x-6 gap-y-3 overflow-y-auto rounded-xl border border-line2 bg-bg2 p-3.5 shadow-[0_6px_24px_rgba(0,0,0,.45)] min-[640px]:grid-cols-2">
          {groups.map((g) => (
            <section key={g.title}>
              <h3 className="mb-1 font-mono text-[9px] uppercase tracking-[.8px] text-faint">{g.title}</h3>
              <ul>
                {g.rows.map((r) => (
                  <li key={r.name + r.what} className="flex items-start gap-2 py-[3px]">
                    <r.Icon {...ico} className="mt-px flex-none text-dim" />
                    <span className="min-w-0 flex-1 text-[11.5px] leading-snug text-dim">
                      <b className="font-medium text-ink">{r.name}</b>
                      {r.what && ` · ${r.what}`}
                    </span>
                    {touch
                      ? r.touch && <span className="flex-none font-mono text-[10px] text-faint">{r.touch}</span>
                      : r.keys && (
                          <span className="flex flex-none flex-wrap justify-end gap-1">
                            {r.keys.map((k) => (
                              <kbd key={k} className="rounded border border-line2 bg-surface px-1.5 py-px font-mono text-[10px] text-ink">
                                {k}
                              </kbd>
                            ))}
                          </span>
                        )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </span>
  );
}
