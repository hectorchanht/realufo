// The fifth "More" tab: every place that isn't one of the four tabs (Ask, Map,
// Cold cases, Browse, Releases). Phone (`sheet`) = a bottom sheet, portaled to
// <body> because BottomTab's slide-away transform would trap a fixed child;
// desktop = a dropdown under the button. Closes on Escape, a tap outside, or
// picking a place. Lit (like a tab) while on one of its pages.
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { Download, Share, Upload } from "lucide-react";
import { promptInstall, useInstallMode } from "../lib/install";
import { MORE_ICON as MoreIcon, tabHref, type NavItem, type NavTab } from "./navItems";
import { downloadIdentity, importIdentity } from "../lib/identity";

const itemCls = (sheet: boolean) =>
  `flex w-full items-center gap-3 rounded-lg px-3 font-mono font-medium hover:bg-surface ${sheet ? "min-h-[48px] text-[14px]" : "min-h-[40px] text-[13px]"}`;

export function MoreMenu({ items, activeTab, sheet = false }: { items: NavItem[]; activeTab: NavTab; sheet?: boolean }) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
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
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      btn.current?.focus();
    };
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !btn.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", down);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("pointerdown", down);
    };
  }, [open]);

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
    <div className={sheet ? "flex flex-1" : "relative flex-none"}>
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
        <MoreIcon size={sheet ? 22 : 18} aria-hidden="true" />
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
    </div>
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
