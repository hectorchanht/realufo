import { describe, it, expect } from "vitest";
import { formatPage, toMarkdown } from "../lib/ocrMarkdown";

// Real PP-OCRv5 output (crawler ingest.ocr) from the spike pages.
const APOLLO = `6-34 CONFIDENTIAL
COLLINS How'd we see this thing? Did we just look out the window
and there it was?
ALDRIN Yes, and we weren't sure but what it might be the S-IVB.
We called the ground and were told the S-IVB was 6ooo miles
away. We had a problem with the high gain about this
time, didn't we?
ARMSTRONG Like an open suitcase.`;
const FBI = `Semi-Monthly Intelligence Conference
August 7, 1952 August 12, 1952
he be furnished with any additional information on her subsequent
to the report of SA JANEs R. HEALY, dated 1-18-52. Copies of
subsequent reports are being furnished to Col. Raynor by separate
letter.
ESTIMATE OF SUBVERSIVE SITUATION BY OSI_
Col, Raynor stated that he had sent back to OSI Headquarters
at Washington, D.C, his report prepared on the estimate of the sub-
versive situation in this ares.`;
const MISREP = `Misrep 4592219
Narrative
AT 0337Z1.4aTOOK OFF FROM OKAS. AT 0359Z.1.4aHANDED OVER FROM THE
LRE. FROM 0434Z TO 2300Z, 1.4a COLLECTED SIGINT VIA AIRHANDLER. FROM 0513Z TO
PROSECUTED, 18.4 SIGINT HOURS, 1 SIGINT TASKING PROSECUTED, 2 TOTAL TASKINGS
PROSECUTED
Admin
CLASSIFICATION
Classification:`;
const FORM = `COUNTRY Chile/Gormany DATE DISTR. 31 July 1950
SUBJECT German Scientist's Article on "Flying Discs" NO. OF PAGES 1
OP YME UNNTED SYATEO WMYHIW THE DEARIISO OP THU RSPIONAOR ACT BO This pocuctENy cortaiNg
# not a heading * nor_emphasis_ [link](x) <b>
1. The first point of the memo goes here and is long enough to wrap
2. Second point`;

// Lossless: the same alphanumeric tokens, in order, after dropping the syntax we add.
const words = (s: string) => s.match(/[A-Za-z0-9]+/g) ?? [];
const plain = (md: string) => md.replace(/^### /gm, "").replace(/\*\*/g, "").replace(/\\(.)/g, "$1");

describe("formatPage", () => {
  it("bolds transcript speaker labels and reflows their wrapped lines", () => {
    const md = toMarkdown(formatPage(APOLLO));
    expect(md).toContain("**COLLINS** How'd we see this thing? Did we just look out the window and there it was?");
    expect(md).toContain("**ALDRIN** Yes, and we weren't sure but what it might be the S-IVB. We called the ground");
    expect(md).toContain("**ARMSTRONG** Like an open suitcase.");
  });

  it("turns short ALL-CAPS lines into headings and joins hyphenated wraps", () => {
    const md = toMarkdown(formatPage(FBI));
    expect(md).toContain("\n### ESTIMATE OF SUBVERSIVE SITUATION BY OSI\\_\n");
    expect(md).toContain("by separate letter.");
    expect(md).toContain("estimate of the sub-versive situation");
    expect(md).toContain("Semi-Monthly Intelligence Conference  \nAugust 7, 1952"); // short lines keep their breaks
  });

  it("an ALL-CAPS paragraph's last short line stays in the paragraph, not a heading", () => {
    const md = toMarkdown(formatPage(MISREP));
    expect(md).toContain("2 TOTAL TASKINGS PROSECUTED");
    expect(md).not.toContain("### PROSECUTED");
    expect(md).not.toContain("### CLASSIFICATION"); // a lone field label stays plain
  });

  it("caps labels at 3 words, escapes Markdown syntax in OCR noise, keeps list lines apart", () => {
    const md = toMarkdown(formatPage(FORM));
    expect(md).toContain("**COUNTRY** Chile/Gormany");
    expect(md).toContain("**SUBJECT** German Scientist's");
    expect(md).not.toContain("**OP YME UNNTED SYATEO");
    expect(md).toContain("\\# not a heading \\* nor\\_emphasis\\_ \\[link\\](x) \\<b\\>");
    expect(md).toMatch(/goes here and is long enough to wrap {2}\n2\. Second point/);
  });

  it("is lossless: every word survives, in order", () => {
    for (const t of [APOLLO, FBI, MISREP, FORM]) expect(words(plain(toMarkdown(formatPage(t))))).toEqual(words(t));
  });

  it("form codes, single words, number-heavy and repeated-token lines are not headings", () => {
    const codes = "OIP-PP\nCONFIDENTIAL\nDOWN UP DOWN UP DOWN UP\nDATE RECEIVED DIR/INT 21 OCT 1948 NO. OIN 12550\nOCT1948";
    expect(formatPage(codes).filter((b) => b.kind === "heading")).toEqual([]);
    expect(formatPage("COMIC BOOKS UNDERMINING MORALE OF ARMED FORCES")[0].kind).toBe("heading");
  });

  it("ALL-CAPS teletype body lines are text, not headings", () => {
    const tty = "URGENT\nSMITH DESCRIBED OBJECT AS APPROXIMATELY SIX FEET IN DIA-\nMETER AND SILVER IN COLOR WITH A DOME\nAPPEARED TO HAVE LANDED AT GREAT SPEED .\nEND";
    expect(formatPage(tty).filter((b) => b.kind === "heading")).toEqual([]);
  });

  it("empty text is no blocks", () => {
    expect(formatPage("  \n ")).toEqual([]);
  });
});
