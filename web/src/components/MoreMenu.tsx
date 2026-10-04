// The fifth "More" tab: every place that isn't one of the four tabs (Ask, Map,
// Cold cases, Browse, Releases). Phone (`sheet`) = a bottom sheet, portaled to
// <body> because BottomTab's slide-away transform would trap a fixed child;
// desktop = a dropdown under the button. Closes on Escape, a tap outside, or
// picking a place. Also holds the site-wide text size (TextSizer), which an
// "Aa" badge nested in an Apple-logo bite out of the More icon opens directly. Lit (like a tab) while on one of its pages.
import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { Download, Share, Upload } from "lucide-react";
import { promptInstall, useInstallMode } from "../lib/install";
import { MORE_ICON as MoreIcon, tabHref, type NavItem, type NavTab } from "./navItems";
import { downloadIdentity, importIdentity } from "../lib/identity";
import { TextSizer } from "./TextSizer";

const itemCls = (sheet: boolean) =>
  `flex w-full items-center gap-3 rounded-lg px-3 font-mono font-medium hover:bg-surface ${sheet ? "min-h-[48px] text-[14px]" : "min-h-[40px] text-[13px]"}`;

export function MoreMenu({ items, activeTab, sheet = false }: { items: NavItem[]; activeTab: NavTab; sheet?: boolean }) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const icon = useRef<SVGSVGElement>(null);
  const id = useId();
  const file = useRef<HTMLInputElement>(null);
  const lit = open || items.some((i) => i.tab === activeTab);
  const row = itemCls(sheet);
  const iconSize = sheet ? 20 : 17;

  const saveId = () => {
    if (confirm("This file is your identity — anyone with it can act as you. Keep it private.")) downloadIdentity();
    setOpen(false);
  };
  const loadId = async (f: File | undefined) => {
    if (!f || !confirm("Replace this device's identity? Votes made here will no longer show as yours.")) return;
    if (importIdentity(await f.text())) location.reload();
    else alert("Not a RealUFO ID file.");
  };

  useEffect(() => setOpen(false), [pathname]);
  useDismiss(open, () => setOpen(false), btn, panel);

  const list = (
    <nav
      ref={panel}
      id={id}
      aria-label="More"
      className={
        sheet
          ? "fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-line bg-bg2 px-3 pt-2 pb-[max(12px,env(safe-area-inset-bottom))] animate-[fadeup_.2s_ease_both]"
          : "absolute right-0 top-full z-50 mt-2 w-52 rounded-xl border border-line bg-bg2 p-1.5 shadow-lg"
      }
    >
      {sheet && <div aria-hidden="true" className="mx-auto mb-2 h-1 w-9 rounded-full bg-line2" />}
      <ul>
        {items.map((item) => {
          const on = item.tab === activeTab;
          const Icon = item.icon;
          return (
            <li key={item.tab}>
              <Link
                to={tabHref(item, activeTab)}
                onClick={() => setOpen(false)}
                aria-current={on ? "page" : undefined}
                className={row}
                style={{ color: on ? "var(--signal)" : "var(--ink)" }}
              >
                <Icon size={iconSize} aria-hidden="true" />
                {item.label}
              </Link>
            </li>
          );
        })}
        <InstallItem sheet={sheet} close={() => setOpen(false)} />
      </ul>
      <div className="my-1 border-t border-line" />
      <TextSizer iconSize={iconSize} className={`flex items-center gap-3 px-3 font-mono font-medium ${sheet ? "min-h-[52px] text-[14px]" : "min-h-[44px] text-[13px]"}`} />
      {/* Same person on another device: move the anon id file (lib/identity.ts). */}
      <div className="my-1 border-t border-line" />
      <button type="button" onClick={saveId} className={row} style={{ color: "var(--ink)" }} title="Download your anonymous ID to use on another device">
        <Download size={iconSize} aria-hidden="true" />
        Download ID
      </button>
      <button type="button" onClick={() => file.current?.click()} className={row} style={{ color: "var(--ink)" }} title="Upload an ID file from another device">
        <Upload size={iconSize} aria-hidden="true" />
        Upload ID
      </button>
      <input
        ref={file}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          void loadId(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </nav>
  );

  return (
    <div className={sheet ? "relative flex flex-1" : "relative flex-none"}>
      <button
        ref={btn}
        type="button"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        title={sheet ? undefined : "More"}
        onClick={() => setOpen((o) => !o)}
        className={
          sheet
            ? "flex min-h-[44px] flex-1 flex-col items-center justify-center gap-1 px-0.5 py-[5px] active:scale-90"
            : "flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-[11px] px-3 font-mono text-[13px] font-medium" + (lit ? "" : " hover:bg-surface")
        }
        style={{ color: lit ? "var(--signal)" : "var(--dim)", background: !sheet && lit ? "var(--signal-dim)" : undefined }}
      >
        <MoreIcon ref={icon} size={sheet ? 22 : 18} aria-hidden="true" style={BITTEN} />
        <span className={lit ? (sheet ? "font-mono text-[9px] font-medium tracking-[.3px]" : "") : "sr-only"}>More</span>
      </button>
      {open &&
        (sheet
          ? createPortal(
              <>
                <div aria-hidden="true" className="fixed inset-0 z-50 bg-black/50" />
                {list}
              </>,
              document.body
            )
          : list)}
      <TextSizeBadge icon={icon} sheet={sheet} />
    </div>
  );
}

// Escape (focus back on the button) or a tap outside the button + panel closes.
function useDismiss(open: boolean, close: () => void, btn: RefObject<HTMLElement | null>, panel: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      close();
      btn.current?.focus();
    };
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !btn.current?.contains(t)) close();
    };
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", down);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("pointerdown", down);
    };
  }, [open, close, btn, panel]);
}

// The bite: a circle just off the icon's top-right (Apple logo) whose edge runs
// through the last dot, sized to the 16px badge + a 2px gap. px on purpose: the
// badge doesn't follow text size.
const BITE_X = 4; // bite centre, px right of the icon
const BITE_Y = 0.23; // bite centre, fraction of icon height
const bite = `radial-gradient(circle at calc(100% + ${BITE_X}px) ${BITE_Y * 100}%, transparent 10px, #000 10.5px)`;
const BITTEN = { maskImage: bite, WebkitMaskImage: bite };

// "Aa" badge sitting in the bite; opens the text sizer. Positioned off the icon's
// measured box (the More label appears when lit and text size moves it).
function TextSizeBadge({ icon, sheet }: { icon: RefObject<SVGSVGElement | null>; sheet: boolean }) {
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const [open, setOpen] = useState<DOMRect | null>(null);
  const { pathname } = useLocation();
  useEffect(() => setOpen(null), [pathname]);
  const close = useRef(() => setOpen(null)).current;
  useDismiss(!!open, close, btn, pop);
  useLayoutEffect(() => {
    const el = icon.current;
    const box = el?.parentElement?.parentElement; // svg -> More button -> wrapper
    if (!el || !box) return;
    const place = () => {
      const i = el.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      setAt({ left: i.right - b.left + BITE_X, top: i.top - b.top + i.height * BITE_Y });
    };
    place();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(place);
    ro.observe(box);
    return () => ro.disconnect();
  }, [icon]);
  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label="Text size"
        title="Text size"
        aria-expanded={!!open}
        onClick={() => setOpen(open ? null : btn.current!.getBoundingClientRect())}
        className="absolute grid h-[16px] w-[16px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full font-mono font-bold leading-none active:scale-90 before:absolute before:-inset-[8px] before:content-['']"
        style={{ ...at, visibility: at ? undefined : "hidden", fontSize: "8px", background: "var(--signal)", color: "var(--bg)" }}
      >
        Aa
      </button>
      {open &&
        createPortal(
          <div
            ref={pop}
            className="fixed z-50 w-[180px] rounded-xl border border-line bg-bg2 p-1.5 shadow-lg animate-[fadeup_.2s_ease_both]"
            style={
              sheet
                ? { right: Math.max(8, innerWidth - open.right - 8), bottom: innerHeight - open.top + 10 }
                : { right: Math.max(8, innerWidth - open.right - 8), top: open.bottom + 10 }
            }
          >
            <TextSizer className="flex items-center gap-2 font-mono text-[13px] font-medium" />
          </div>,
          document.body
        )}
    </>
  );
}

function InstallItem({ sheet, close }: { sheet: boolean; close: () => void }) {
  const mode = useInstallMode();
  const [help, setHelp] = useState(false);
  if (!mode) return null;
  const tap = () => {
    if (mode === "ios") return setHelp((h) => !h);
    close();
    void promptInstall();
  };
  return (
    <li>
      <button type="button" onClick={tap} aria-expanded={mode === "ios" ? help : undefined} className={itemCls(sheet)} style={{ color: "var(--ink)" }}>
        <Download size={sheet ? 20 : 17} aria-hidden="true" />
        Install app
      </button>
      {help && (
        <p className="px-3 pb-2 font-mono text-[12px] leading-relaxed text-dim">
          Tap <Share size={13} aria-label="Share" className="inline align-[-2px]" /> then “Add to Home Screen”.
        </p>
      )}
    </li>
  );
}
