// Language: English / Traditional Chinese (zh-Hant). Persisted in localStorage,
// toggled from the footer. Covers the persistent shell (nav, footer) and case
// titles/ledes; long-form content (story bodies, docs) stays English for now —
// a half-translated archive is worse than a clearly-English one.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Lang = "en" | "zh-Hant";
const KEY = "realufo.lang";

const STRINGS = {
  // nav tabs
  "nav.feed": ["Home", "首頁"],
  "nav.archive": ["Archive", "檔案庫"],
  "nav.shorts": ["Shorts", "短片"],
  "nav.boards": ["Boards", "討論區"],
  "nav.ask": ["Ask", "問檔案"],
  "nav.map": ["Map", "地圖"],
  "nav.timeline": ["Timeline", "時間線"],
  "nav.cases": ["Cold cases", "懸案"],
  "nav.browse": ["Browse", "瀏覽"],
  "nav.releases": ["Releases", "解密批次"],
  "nav.notifications": ["Notifications", "通知"],
  "nav.more": ["More", "更多"],
  // footer
  "footer.tagline": ["Public-domain U.S. government records, mirrored verbatim.", "美國政府公開檔案，原文轉載。"],
  "footer.explore": ["Explore", "探索"],
  "footer.topics": ["Topics", "主題"],
  "footer.releases": ["Releases", "解密批次"],
  "footer.agencies": ["Agencies", "機構"],
  "footer.decades": ["Decades", "年代"],
  "footer.resources": ["Resources", "資源"],
  "footer.request": ["Request a file 🛸", "許願池 🛸"],
  "footer.developers": ["Developers", "開發者"],
  "footer.privacy": ["Privacy", "私隱"],
  "footer.terms": ["Terms", "條款"],
  "footer.tracker": ["Tracker", "追蹤器"],
  "footer.openDataset": ["Open dataset", "開放數據集"],
  "footer.original": ["Original archive ↗", "舊版檔案庫 ↗"],
  "lang.label": ["繁", "EN"],
  "lang.name": ["Traditional Chinese", "English"],
  "cases.sub": ["Famous cases and the files behind them", "著名案件與背後的檔案"],
} as const;

export type StringKey = keyof typeof STRINGS;

const LangCtx = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: (k: StringKey) => string }>({
  lang: "en",
  setLang: () => {},
  t: (k) => STRINGS[k][0],
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      return (localStorage.getItem(KEY) as Lang) === "zh-Hant" ? "zh-Hant" : "en";
    } catch {
      return "en";
    }
  });
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(KEY, l);
    } catch { /* private mode */ }
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const t = useCallback((k: StringKey) => STRINGS[k][lang === "zh-Hant" ? 1 : 0], [lang]);
  const v = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <LangCtx.Provider value={v}>{children}</LangCtx.Provider>;
}

export const useLang = () => useContext(LangCtx);
