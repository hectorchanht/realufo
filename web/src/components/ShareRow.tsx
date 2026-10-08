import { useRef, useState } from "react";
import { Link2, Check } from "lucide-react";
import { useLang } from "../lib/lang";

// Share row for a record: copy link, X, Facebook, WhatsApp.
// Lucide dropped brand icons, so X/Facebook/WhatsApp are minimal inline SVGs;
// everything else is Lucide. Icon-only buttons with translated labels.
// Hover shows each brand's identity color (copy/X resolve to theme ink).
const X_PATH =
  "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.451-6.231zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644z";
const FB_PATH =
  "M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z";
const WA_PATH =
  "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z";

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
    { key: "x", label: t("share.x"), href: `https://x.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`, icon: <BrandIcon d={X_PATH} />, hover: "hover:text-ink" },
    { key: "fb", label: t("share.facebook"), href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, icon: <BrandIcon d={FB_PATH} />, hover: "hover:text-[#1877F2]" },
    {
      key: "wa",
      label: t("share.whatsapp"),
      href: `https://wa.me/?text=${encodeURIComponent(text)}`,
      icon: <BrandIcon d={WA_PATH} />,
      hover: "hover:text-[#25D366]",
    },
  ];

  const btn =
    "grid h-11 w-11 shrink-0 place-items-center rounded-full text-dim transition hover:bg-panel";

  return (
    <div aria-label={t("share.rowLabel")} className="flex items-center gap-0.5" role="group">
      <button
        type="button"
        onClick={onCopy}
        aria-label={copied ? t("share.copied") : t("share.copyLink")}
        title={copied ? t("share.copied") : t("share.copyLink")}
        className={`${btn} hover:text-ink`}
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
          className={`${btn} ${s.hover}`}
        >
          {s.icon}
        </a>
      ))}
    </div>
  );
}
