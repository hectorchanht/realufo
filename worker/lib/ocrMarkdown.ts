// Lossless OCR text -> light Markdown structure (spec 2026-10-03-realufo-paddleocr-reocr).
// Shared by GET /doc/<id>/text and the doc page's MD view (web imports it). Only adds
// formatting, never drops or reorders a word: short ALL-CAPS lines become headings,
// transcript/form labels ("ALDRIN Yes, …", "SUBJECT German …") get bold, wrapped
// full-width lines are reflowed into one line, and short lines keep their breaks.
// PP-StructureV3 was tried for this and dropped text on transcripts and forms.

export type Line = { label?: string; text: string };
export type Block = { kind: "heading"; text: string } | { kind: "para"; lines: Line[] };

const LONG = 45; // a line this long is a wrapped full-width line, so the next one continues it
const HEAD_MAX = 60;
const LIST = /^(\(?\d{1,2}[.)]|\(?[a-z][.)])\s/;
// 1-3 ALL-CAPS words, then a normal word ("ALDRIN Yes", "COLLINS I don't").
const LABEL = /^((?:[A-Z][A-Z'.-]+\s+){1,3})(?=[A-Z]?[a-z]|I\s)/;

function labelOf(line: string): string | null {
  const m = LABEL.exec(line);
  return m && m[1].length <= 25 ? m[1].trim() : null;
}

// A short ALL-CAPS line of real words ("ESTIMATE OF SUBVERSIVE SITUATION"), not a form
// code, a single field label, a date/number line or repeated tokens ("DOWN UP DOWN UP").
function isHeading(line: string): boolean {
  const letters = line.replace(/[^A-Za-z]/g, "");
  if (line.length > HEAD_MAX || letters.length < 3) return false;
  if (letters.replace(/[^A-Z]/g, "").length / letters.length < 0.9) return false;
  if (letters.length / line.replace(/\s/g, "").length < 0.75) return false;
  if (/[-,.;]$/.test(line)) return false; // a wrapped or finished sentence, not a title
  const words = line.match(/[A-Za-z']{3,}/g) ?? [];
  return words.length >= 2 && new Set(words).size * 2 > words.length;
}

// An ALL-CAPS line of 3+ words: next to another one it's a teletype body, not a title.
function capsBody(line: string | undefined): boolean {
  if (!line) return false;
  const letters = line.replace(/[^A-Za-z]/g, "");
  return letters.length >= 3 && letters.replace(/[^A-Z]/g, "").length / letters.length >= 0.9 &&
    (line.match(/[A-Za-z']{2,}/g) ?? []).length >= 3;
}

export function formatPage(text: string): Block[] {
  const blocks: Block[] = [];
  let para: Line[] | null = null;
  let prev = ""; // previous raw line ("" after a blank line or a heading)
  const lines = text.split("\n").map((l) => l.trim());
  lines.forEach((line, i) => {
    if (!line) {
      para = null;
      prev = "";
      return;
    }
    const label = labelOf(line);
    if (para && prev.length >= LONG && !prev.endsWith(":") && !LIST.test(line) && !label) {
      const last = para[para.length - 1];
      // "sub-" + "versive": rejoin the hyphenated wrap without inventing a space
      last.text += /[A-Za-z]-$/.test(last.text) && /^[a-z]/.test(line) ? line : ` ${line}`;
    } else if (!label && isHeading(line) && !capsBody(lines[i - 1]) && !capsBody(lines[i + 1])) {
      blocks.push({ kind: "heading", text: line });
      para = null;
      prev = "";
      return;
    } else if (label) {
      para = [{ label, text: line.slice(label.length).trim() }];
      blocks.push({ kind: "para", lines: para });
    } else {
      if (!para) blocks.push({ kind: "para", lines: (para = []) });
      para.push({ text: line });
    }
    prev = line;
  });
  return blocks;
}

// OCR noise must not turn into Markdown syntax.
const esc = (s: string) => s.replace(/[\\`*_[\]<>#]/g, "\\$&").replace(/^([-+=|])/, "\\$1");

export function toMarkdown(blocks: Block[]): string {
  return blocks
    .map((b) =>
      b.kind === "heading"
        ? `### ${esc(b.text)}`
        : b.lines.map((l) => (l.label ? `**${esc(l.label)}** ` : "") + esc(l.text)).join("  \n"),
    )
    .join("\n\n");
}
