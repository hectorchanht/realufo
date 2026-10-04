/** 1 → "1 comment", 2 → "2 comments", 1200 → "1,200 comments". */
export const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
