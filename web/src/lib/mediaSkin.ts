import { useState } from "react";

// Media console layout: the visitor picks the toolbox they like — Simple or
// 茶盤 — and the choice stays on this device. 茶盤 is the instrument console
// (茶盤 ちゃばん design style): the DJ deck on wide screens, the Walkman on
// phones, same tools either way. Spec:
// docs/superpowers/specs/2026-10-04-media-dj-console-design.md
export type MediaSkin = "simple" | "chaban";

export const SKINS: { key: MediaSkin; name: string; blurb: string }[] = [
  { key: "simple", name: "Simple", blurb: "Chips, sliders and labels — the plain toolbox." },
  { key: "chaban", name: "茶盤", blurb: "Faders, pads and a click wheel — the instrument console." },
];

const SKIN_KEY = "ru:media-skin";

export function loadSkin(): MediaSkin {
  try {
    const s = localStorage.getItem(SKIN_KEY);
    if (s === "simple") return "simple";
    if (s === "chaban" || s === "dj" || s === "walkman") return "chaban"; // pre-release names
  } catch {
    /* private mode etc. */
  }
  return "simple"; // new visitors meet the plainest one
}

export function saveSkin(s: MediaSkin) {
  try {
    localStorage.setItem(SKIN_KEY, s);
  } catch {
    /* the choice lasts for this page only */
  }
}

/** Skin state for the console; persists per browser. */
export function useMediaSkin(): [MediaSkin, (s: MediaSkin) => void] {
  const [skin, setSkinState] = useState<MediaSkin>(loadSkin);
  function set(s: MediaSkin) {
    setSkinState(s);
    saveSkin(s);
  }
  return [skin, set];
}
