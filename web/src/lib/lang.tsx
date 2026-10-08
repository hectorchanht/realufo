// Language: English only for now — zh-Hant strings stay in STRINGS so the
// toggle can come back later with a one-line change. LangProvider hard-codes
// "en" (stored prefs are ignored) and the footer toggle is unmounted.
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react";

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
  "footer.shelf": ["Reading shelf", "閱讀書架"],
  "footer.newsletter": ["Newsletter", "電子報"],
  "footer.podcast": ["Podcast", "播客"],
  "footer.request": ["Request a file 🛸", "許願池 🛸"],
  "footer.developers": ["Developers", "開發者"],
  "footer.privacy": ["Privacy", "私隱"],
  "footer.terms": ["Terms", "條款"],
  "footer.about": ["About", "關於"],
  "footer.contact": ["Contact", "聯絡"],
  "footer.faq": ["FAQ", "常見問題"],
  "footer.glossary": ["Glossary", "術語表"],
  "footer.foia": ["FOIA", "資訊自由法"],
  "footer.tracker": ["Tracker", "追蹤器"],
  "footer.compare": ["Compare", "比較"],
  "footer.leaderboard": ["Leaderboard", "排行榜"],
  "footer.openDataset": ["Open dataset", "開放數據集"],
  "footer.original": ["Original archive ↗", "舊版檔案庫 ↗"],
  "lang.label": ["繁", "EN"],
  "lang.name": ["Traditional Chinese", "English"],
  "cases.sub": ["Famous cases and the files behind them", "著名案件與背後的檔案"],
  // doc screen discussion engagement
  "doc.discussThread": ["Discuss this", "討論呢份文件"],
  "doc.startDiscussion": ["Start the discussion", "開個討論串"],
  "doc.voteNudge": ["You voted — say something?", "投咗票，講兩句？"],
  "doc.quickReply": ["Add your read…", "講下你點睇…"],
  "doc.sendReply": ["Send reply", "發送回覆"],
  "doc.dismiss": ["Dismiss", "關閉"],
  "doc.posted": ["Posted", "已發佈"],
  "doc.starterLabel": ["AI discussion starter", "AI 開場問題"],
  "doc.starterReply": ["Reply", "回覆"],
  // thread composer reply notifications
  "thread.notifyEmailPh": ["Email for reply alerts (optional)", "收回覆通知用電郵（選填）"],
  "thread.notifyEmailHint": ["We'll email you when someone quotes your post. One-click unsubscribe, no spam.", "有人引用回覆你嗰陣會 email 通知你，一㩒即退訂，唔會 spam。"],
  // archive sort options
  "archive.sortLabel": ["Sort", "排序"],
  "archive.sortFeatured": ["Featured first", "精選優先"],
  "archive.sortNew": ["Newest added", "最新加入"],
  "archive.sortOld": ["Oldest incident", "最早事件"],
  "archive.sortRecent": ["Newest incident", "最新事件"],
  "archive.sortRelease": ["Newest release", "最新解密"],
  "archive.sortAz": ["Title A–Z", "標題 A–Z"],
  "archive.sortDiscussed": ["Most discussed", "最多討論"],
  "archive.sortWtfWeek": ["Most WTF this week", "本週最 WTF"],
  "archive.sortWtfMonth": ["Most WTF this month", "本月最 WTF"],
  "leaderboard.title": ["WTF Leaderboard", "WTF 排行榜"],
  "leaderboard.subtitle": ["The files the crowd finds hardest to explain, ranked by unexplained votes.", "群眾覺得最難解釋嘅檔案，按「無法解釋」票數排名。"],
  "leaderboard.week": ["This week", "本週"],
  "leaderboard.month": ["This month", "本月"],
  "leaderboard.emptyLine1": ["no votes yet.", "暫時未有人投票。"],
  "leaderboard.emptyLine2": ["be the first to call it.", "做第一個投票嘅人。"],
  "leaderboard.link": ["Leaderboard", "排行榜"],
  "archive.emptyLine1": ["no records match.", "搵唔到相關檔案。"],
  "archive.emptyLine2": ["the truth is elsewhere.", "真相喺第二度。"],
  // doc screen share row
  "share.rowLabel": ["Share this file", "分享呢份檔案"],
  "share.copyLink": ["Copy link", "複製連結"],
  "share.copied": ["Link copied", "已複製連結"],
  "share.x": ["Share on X", "分享去 X"],
  "share.facebook": ["Share on Facebook", "分享去 Facebook"],
  "share.whatsapp": ["Share on WhatsApp", "分享去 WhatsApp"],
  // doc screen blink: shown under the title of top-WTF records
  "doc.wtfBlink": ["Yeah, we know why you're here.", "我哋知你嚟睇乜。"],
  // funnel: realufo.org -> watchthenight.com (own site, not an affiliate hop)
  "funnel.heading": ["See it yourself", "自己親眼睇"],
  "funnel.body": ["Reading about the sky is one thing. Here's the gear we'd recommend if you want to look up and check for yourself.", "睇檔案係一回事，如果你想親自抬頭睇返轉頭，呢度係我哋推薦嘅觀星裝備。"],
  "funnel.cta": ["Browse the gear guide →", "睇裝備指南 →"],
  "funnel.stripQ": ["Want to see for yourself?", "想自己親眼睇？"],
  "funnel.stripLink": ["Our citizen skywatch gear guide", "我哋嘅 citizen skywatch 裝備指南"],
} as const;

export type StringKey = keyof typeof STRINGS;

const LangCtx = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: (k: StringKey) => string }>({
  lang: "en",
  setLang: () => {},
  t: (k) => STRINGS[k][0],
});

export function LangProvider({ children }: { children: ReactNode }) {
  // zh-Hant disabled: everyone gets English. setLang is a no-op that also
  // clears any stale stored preference so it can't resurrect later.
  const setLang = useCallback((_l: Lang) => {
    try {
      localStorage.removeItem(KEY);
    } catch { /* private mode */ }
  }, []);
  useEffect(() => {
    document.documentElement.lang = "en";
  }, []);
  const t = useCallback((k: StringKey) => STRINGS[k][0], []);
  const v = useMemo(() => ({ lang: "en" as Lang, setLang, t }), [setLang, t]);
  return <LangCtx.Provider value={v}>{children}</LangCtx.Provider>;
}

export const useLang = () => useContext(LangCtx);
