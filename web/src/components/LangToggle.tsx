// Language toggle (EN / 繁) in the footer, next to the appearance switcher.
import { useLang } from "../lib/lang";

export default function LangToggle() {
  const { lang, setLang, t } = useLang();
  const next = lang === "en" ? "zh-Hant" : "en";
  return (
    <button
      type="button"
      onClick={() => setLang(next)}
      aria-label={t("lang.name")}
      title={t("lang.name")}
      className="rounded-full border border-line px-3 py-1.5 font-mono text-[11px] text-dim transition hover:border-signal hover:text-ink"
    >
      {t("lang.label")}
    </button>
  );
}
