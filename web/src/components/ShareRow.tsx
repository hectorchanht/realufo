import { useRef, useState } from "react";
import { Link2, Check, MessageCircle } from "lucide-react";
import { useLang } from "../lib/lang";

// Share row for a record: copy link, X, Facebook, WhatsApp.
// Lucide dropped brand icons, so X/Facebook are minimal inline SVGs;
// everything else is Lucide. Icon-only buttons with translated labels.
const X_PATH =
  "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.451-6.231zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644z";
const FB_PATH =
  "M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z";

function BrandIcon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // clipboard API unavailable (insecure context): textarea fallback
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

export function ShareRow({ url, title }: { url: string; title: string }) {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  const onCopy = async () => {
    if (await copyText(url)) {
      setCopied(true);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1600);
    }
  };

  const text = `${title} ${url}`;
  const targets = [
    { key: "x", label: t("share.x"), href: `https://x.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`, icon: <BrandIcon d={X_PATH} /> },
    { key: "fb", label: t("share.facebook"), href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, icon: <BrandIcon d={FB_PATH} /> },
    {
      key: "wa",
      label: t("share.whatsapp"),
      href: `https://wa.me/?text=${encodeURIComponent(text)}`,
      icon: <MessageCircle size={19} />,
    },
  ];

  const btn =
    "grid h-11 w-11 shrink-0 place-items-center rounded-full text-dim transition hover:bg-panel hover:text-ink";

  return (
    <div aria-label={t("share.rowLabel")} className="flex items-center gap-0.5" role="group">
      <button
        type="button"
        onClick={onCopy}
        aria-label={copied ? t("share.copied") : t("share.copyLink")}
        title={copied ? t("share.copied") : t("share.copyLink")}
        className={btn}
      >
        {copied ? <Check size={19} className="text-[var(--signal)]" /> : <Link2 size={19} />}
      </button>
      {targets.map((s) => (
        <a
          key={s.key}
          href={s.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={s.label}
          title={s.label}
          className={btn}
        >
          {s.icon}
        </a>
      ))}
    </div>
  );
}
