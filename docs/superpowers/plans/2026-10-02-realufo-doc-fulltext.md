# Full Text on Doc Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show each PDF's quality-filtered, ~30k-char-capped extracted text on its existing doc page, for crawlers (Worker pre-render) and people (SPA) alike.

**Architecture:** New Python CLI `ingest.fulltext` extracts text (reusing `textindex.pdf_pages`), drops OCR-noise pages, caps, and writes one D1 `record_text` row per PDF. `loadRecord` returns it as `fullText`; the Worker's `docBody` and a new SPA `FullText` component render the same pages.

**Tech Stack:** Python 3 + pytest (crawler), Cloudflare Workers + D1 + vitest-pool-workers (worker), React + vitest + testing-library (web), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-02-realufo-doc-fulltext-design.md`

## Global Constraints

- Quality filter, verbatim from spec: keep a page iff ≥ 200 alphanumeric chars AND `word_ratio ≥ 0.65`; word regex `^[("']?[A-Za-z][a-z]*(?:[-'][a-z]+)?[.,;:)"'?!]*$|^\d[\d,./-]*[.,;:]?$`.
- Cap: 30000 chars of kept text per record, cut at last line break or `". "` before the cap; a cut tail shorter than 200 chars is dropped; `truncated=1` whenever kept-quality text was left out.
- Every PDF processed gets a row, even with `pages='[]'` (no daily retries). Download/pdftotext failures get no row (retried next run) and make the exit code 1.
- `pages` JSON shape: `[{"n": <1-based PDF page>, "text": "..."}]`, `json.dumps(..., ensure_ascii=False)`.
- `fullText` API shape: `{ pages: {n:number,text:string}[]; truncated: boolean; total_pages: number } | null`.
- All page text rendered through `esc()` in the Worker; React text nodes in the SPA (never `dangerouslySetInnerHTML`).
- Other chats share the `build/app-foundation` checkout: execute in a worktree; stage only files a task names.
- Worker tests: `npx vitest run --config worker/vitest.config.ts` (repo root). Web tests need Node 22: `PATH=$HOME/.nvm/versions/node/v22.22.0/bin:$PATH pnpm -C web test`. Python: `cd crawler && python3 -m pytest -q ingest/tests/...`.

## Review Focus

1. Page text containing `'`, `;`, newlines, `--`, emoji or control chars → the generated SQL loads into SQLite and round-trips the JSON exactly. Test in Task 1 (`test_row_sql_round_trips_through_sqlite`).
2. A 2.8 MB NARA scan → stored row stays well under D1's 100 KB SQL-statement limit. Test in Task 1 (`test_row_sql_stays_under_d1_statement_limit`).
3. `<script>` / `</script>` inside OCR text → escaped in pre-render, plain text in SPA. Tests in Tasks 2 and 3.
4. A `record_text` row with `pages='[]'` → no "Full text" heading anywhere (pre-render or SPA). Tests in Tasks 2 and 3.
5. Page text that is only blank lines / whitespace runs → no empty `<p>` in pre-render. Test in Task 2.

---

### Task 1: `ingest.fulltext` extractor

**Files:**
- Create: `crawler/ingest/fulltext.py`
- Create: `crawler/ingest/tests/fixtures/ocr-1946-p3.txt`, `crawler/ingest/tests/fixtures/ocr-1946-p20.txt`
- Test: `crawler/ingest/tests/test_fulltext.py`

**Interfaces:**
- Consumes: `ingest.textindex.pdf_pages(url: str, work: str) -> list[str]`, `ingest.textindex.flush(lines: list[str], work: str) -> None` (writes the lines to a .sql file and calls `d1.apply_sql`), `ingest.d1._d1_json(sql) -> list[dict]`, `ingest.d1.sql_q(v) -> str`.
- Produces: CLI `python -m ingest.fulltext [--dry-run] [--limit N]`; D1 rows in `record_text(record_id, pages, truncated, total_pages)` (table created in Task 2's migration — the CLI is only run live after that migration is applied, Task 4).

- [ ] **Step 1: Create the OCR fixtures** (full pages; short excerpts give unstable ratios)

```bash
SP=$(mktemp -d)
curl -s -o "$SP/amc.pdf" "https://assets.realufo.org/pdfs/wargov/18_100754_%20general%201946-7_vol_2.pdf"
python3 - "$SP/amc.pdf" <<'EOF'
import subprocess, sys
pages = subprocess.run(["pdftotext", "-enc", "UTF-8", sys.argv[1], "-"], capture_output=True, text=True, check=True).stdout.split("\f")
d = "crawler/ingest/tests/fixtures/"
open(d + "ocr-1946-p3.txt", "w", encoding="utf-8").write(pages[2])
open(d + "ocr-1946-p20.txt", "w", encoding="utf-8").write(pages[19])
EOF
head -c 120 crawler/ingest/tests/fixtures/ocr-1946-p20.txt
```

Expected: p20 begins with `.. C 0 p y` / `29 September 1947` (the "Flying Discs" memo).

- [ ] **Step 2: Write the failing tests** — `crawler/ingest/tests/test_fulltext.py`

```python
import json, pathlib, sqlite3, pytest
from ingest import fulltext

FIX = pathlib.Path(__file__).parent / "fixtures"
CLEAN = " ".join(f"The witness reported a bright object over the runway at {i} hours." for i in range(30))

def test_word_ratio_separates_garbled_from_noisy_but_readable_ocr():
    garbled = (FIX / "ocr-1946-p3.txt").read_text(encoding="utf-8")
    readable = (FIX / "ocr-1946-p20.txt").read_text(encoding="utf-8")
    assert fulltext.word_ratio(garbled) < 0.6
    assert fulltext.word_ratio(readable) >= 0.65
    assert not fulltext.keep_page(fulltext.clean_page(garbled))
    assert fulltext.keep_page(fulltext.clean_page(readable))

def test_keep_page_needs_200_alnum_and_wordy_text():
    assert fulltext.keep_page(CLEAN)
    assert not fulltext.keep_page("The object was seen.")        # too short
    assert not fulltext.keep_page(".,;' -- ~~ |\n" * 80)          # noise

def test_clean_page_collapses_spaces_and_blank_runs():
    assert fulltext.clean_page("  a   b \n\n\n\n c\t\td  ") == "a b\n\nc d"

def test_select_pages_keeps_pdf_page_numbers_and_skips_noise():
    kept, truncated = fulltext.select_pages(["~~ |", CLEAN, "", CLEAN + " end."])
    assert [p["n"] for p in kept] == [2, 4]
    assert truncated is False

def test_select_pages_caps_at_a_line_break_and_flags_truncation():
    page = "\n".join(f"Line {i}: the radar operator logged another contact near the base." for i in range(100))
    kept, truncated = fulltext.select_pages([page, page], cap=5000)
    assert truncated is True
    assert [p["n"] for p in kept] == [1]
    assert len(kept[0]["text"]) <= 5000
    assert kept[0]["text"].endswith("base.")

def test_select_pages_drops_a_tail_cut_too_short_to_read():
    kept, truncated = fulltext.select_pages([CLEAN, CLEAN], cap=len(CLEAN) + 50)
    assert [p["n"] for p in kept] == [1]
    assert truncated is True

def test_select_pages_all_noise_is_empty_not_truncated():
    assert fulltext.select_pages(["", ".,;' --" * 50]) == ([], False)

def test_row_sql_escapes_quotes_and_stores_json():
    sql = fulltext.row_sql("ID'1", [{"n": 2, "text": "O'Hare — “disc”"}], True, 9)
    assert sql.startswith("INSERT OR REPLACE INTO record_text(record_id,pages,truncated,total_pages) VALUES('ID''1',")
    assert "O''Hare — “disc”" in sql
    assert sql.endswith(",1,9);")
    assert fulltext.row_sql("X", [], False, 3).endswith("'X','[]',0,3);")

def test_row_sql_round_trips_through_sqlite():
    pages = [{"n": 1, "text": "it's; DROP TABLE x; --\nline two \u0007 🛸 “q”"}]
    db = sqlite3.connect(":memory:")
    db.execute("CREATE TABLE record_text(record_id TEXT PRIMARY KEY, pages TEXT, truncated INT, total_pages INT)")
    db.executescript(fulltext.row_sql("R'1", pages, False, 4))
    rid, stored, trunc, total = db.execute("SELECT * FROM record_text").fetchone()
    assert (rid, json.loads(stored), trunc, total) == ("R'1", pages, 0, 4)

def test_row_sql_stays_under_d1_statement_limit():
    # multibyte punctuation (— “ ”) so bytes > chars; ~24k chars per page, 50 pages
    huge = ["\n".join(f"Line {i}: the object was bright — “very” fast; seen at {i} h." for i in range(400))] * 50
    kept, truncated = fulltext.select_pages(huge)
    assert truncated is True
    assert len(fulltext.row_sql("BIG", kept, truncated, 50).encode("utf-8")) < 100_000

@pytest.fixture
def world(monkeypatch):
    w = {"rows": [], "applied": [], "pages": {}}
    monkeypatch.setattr(fulltext.d1, "_d1_json", lambda sql: w["rows"])
    monkeypatch.setattr(fulltext.d1, "apply_sql", lambda path: w["applied"].append(open(path, encoding="utf-8").read()))
    def pdf_pages(url, work):
        p = w["pages"].get(url, [CLEAN])
        if isinstance(p, Exception):
            raise p
        return p
    monkeypatch.setattr(fulltext, "pdf_pages", pdf_pages)
    return w

def run(*argv):
    with pytest.raises(SystemExit) as e:
        fulltext.main(list(argv))
    return e.value.code

def test_live_run_writes_one_row_per_record_including_empty(world):
    world["rows"] = [{"id": "P1", "url": "u1"}, {"id": "P2", "url": "u2"}]
    world["pages"]["u2"] = ["~~ |"]
    assert run() == 0
    sql = "".join(world["applied"])
    assert "VALUES('P1','[{\"n\": 1, \"text\": \"The witness" in sql
    assert "VALUES('P2','[]',0,1);" in sql

def test_failed_download_gets_no_row_and_exit_code_1(world):
    world["rows"] = [{"id": "P1", "url": "u1"}, {"id": "P3", "url": "u3"}]
    world["pages"]["u3"] = RuntimeError("404")
    assert run() == 1
    sql = "".join(world["applied"])
    assert "'P1'" in sql and "'P3'" not in sql

def test_dry_run_writes_nothing(world):
    world["rows"] = [{"id": "P1", "url": "u1"}]
    assert run("--dry-run") == 0
    assert world["applied"] == []
```

- [ ] **Step 3: Run to verify they fail**

Run: `cd crawler && python3 -m pytest -q ingest/tests/test_fulltext.py`
Expected: collection ERROR — `ImportError: cannot import name 'fulltext'`.

- [ ] **Step 4: Implement** — `crawler/ingest/fulltext.py`

```python
"""Full text for doc pages (spec 2026-10-02-realufo-doc-fulltext-design).

    python3 -m ingest.fulltext --dry-run --limit 3   # extract + select only
    python3 -m ingest.fulltext                       # write D1 record_text rows

Every live PDF without a record_text row: download, pdftotext, keep the pages
that read like text (OCR noise dropped), cap at ~30k chars, store as JSON
pages. A PDF with no clean page still gets a row (pages='[]') so it isn't
retried daily; download/pdftotext failures get no row and are retried.
"""
import argparse, json, re, sys, tempfile
from . import d1
from .textindex import pdf_pages, flush

SELECT = """SELECT r.id,
  (SELECT cdn_url FROM assets a WHERE a.record_id=r.id AND a.role='full' LIMIT 1) AS url
FROM records r LEFT JOIN record_text rt ON rt.record_id=r.id
WHERE r.status='live' AND r.kind='pdf' AND rt.record_id IS NULL
  AND EXISTS (SELECT 1 FROM assets a WHERE a.record_id=r.id AND a.role='full')
ORDER BY r.created_at DESC, r.id"""
CAP = 30000
MIN_ALNUM = 200
MIN_RATIO = 0.65  # tuned 2026-10-02: <0.6 unreadable OCR, ~0.7 noisy but readable
FLUSH_EVERY = 25
WORD = re.compile(r"""^[("']?[A-Za-z][a-z]*(?:[-'][a-z]+)?[.,;:)"'?!]*$|^\d[\d,./-]*[.,;:]?$""")

def clean_page(text: str) -> str:
    t = re.sub(r"[ \t]+", " ", text)
    t = re.sub(r" *\n *", "\n", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()

def word_ratio(text: str) -> float:
    toks = text.split()
    return sum(bool(WORD.match(t)) for t in toks) / len(toks) if toks else 0.0

def keep_page(text: str) -> bool:
    return sum(c.isalnum() for c in text) >= MIN_ALNUM and word_ratio(text) >= MIN_RATIO

def _cut(text: str, room: int) -> str:
    # At most `room` chars, ending at a line break or sentence end ("" if neither fits).
    if len(text) <= room:
        return text
    head = text[:room]
    cut = max(head.rfind("\n"), head.rfind(". ") + 1)
    return head[:cut].rstrip() if cut > 0 else ""

def select_pages(pages: list[str], cap: int = CAP) -> tuple[list[dict], bool]:
    kept, total = [], 0
    for n, raw in enumerate(pages, 1):
        text = clean_page(raw)
        if not keep_page(text):
            continue
        piece = _cut(text, cap - total)
        if piece != text:
            if len(piece) >= MIN_ALNUM:
                kept.append({"n": n, "text": piece})
            return kept, True
        kept.append({"n": n, "text": text})
        total += len(text)
    return kept, False

def row_sql(rid: str, kept: list[dict], truncated: bool, total_pages: int) -> str:
    pages = json.dumps(kept, ensure_ascii=False)
    return ("INSERT OR REPLACE INTO record_text(record_id,pages,truncated,total_pages) VALUES("
            f"{d1.sql_q(rid)},{d1.sql_q(pages)},{int(truncated)},{int(total_pages)});")

def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="extract + select only; no D1 writes")
    ap.add_argument("--limit", type=int, default=None, help="max records this run")
    args = ap.parse_args(argv)
    rows = d1._d1_json(" ".join(SELECT.split()))[: args.limit]
    pending, ok, failed = [], 0, 0
    with tempfile.TemporaryDirectory() as work:
        for i, row in enumerate(rows, 1):
            try:
                pages = pdf_pages(row["url"], work)
            except Exception as e:
                failed += 1
                print(f"[{i}/{len(rows)}] FAIL {row['id']}: {e}")
                continue
            kept, truncated = select_pages(pages)
            ok += 1
            chars = sum(len(p["text"]) for p in kept)
            print(f"[{i}/{len(rows)}] ok   {row['id']} pages={len(kept)}/{len(pages)} chars={chars}"
                  f"{' truncated' if truncated else ''}")
            pending.append(row_sql(row["id"], kept, truncated, len(pages)))
            if not args.dry_run and len(pending) >= FLUSH_EVERY:
                flush(pending, work)
                pending = []
        if not args.dry_run and pending:
            flush(pending, work)
    print(f"{'dry-run ' if args.dry_run else ''}fulltext ok={ok} failed={failed}")
    sys.exit(1 if failed else 0)

if __name__ == "__main__":
    main()
```

Note: `0 < cap - total` always holds when the loop reaches `_cut` (each kept page adds ≤ the remaining room, and a cut returns), so `_cut` never gets a non-positive room.

- [ ] **Step 5: Run to verify they pass**

Run: `cd crawler && python3 -m pytest -q ingest/tests/test_fulltext.py`
Expected: 13 passed.

- [ ] **Step 6: Whole crawler suite**

Run: `cd crawler && python3 -m pytest -q`
Expected: all pass (no other module changed).

- [ ] **Step 7: Commit**

```bash
git add crawler/ingest/fulltext.py crawler/ingest/tests/test_fulltext.py crawler/ingest/tests/fixtures/ocr-1946-p3.txt crawler/ingest/tests/fixtures/ocr-1946-p20.txt
git commit -m "feat(ingest): fulltext — quality-filtered, capped PDF text into D1 record_text"
```

---

### Task 2: `record_text` table, `loadRecord.fullText`, pre-rendered Full text section

**Files:**
- Create: `db/migrations/0011_record_text.sql`
- Modify: `worker/routes/records.ts` (`loadRecord`)
- Modify: `worker/lib/ssr.ts` (`DocData`, `docBody`)
- Test: `worker/tests/schema.spec.ts` (EXPECTED list), `worker/tests/records.spec.ts`, `worker/tests/ssr.spec.ts`, `worker/tests/meta.spec.ts`

**Interfaces:**
- Consumes: nothing from Task 1 at code level (shared contract = `record_text` schema + `pages` JSON shape in Global Constraints).
- Produces: `loadRecord(env, id)` result gains `fullText: { pages: { n: number; text: string }[]; truncated: boolean; total_pages: number } | null`; `GET /api/records/:id` JSON gains the same field (Task 3 consumes it). `DocData.fullText?` in `worker/lib/ssr.ts`.

- [ ] **Step 1: Migration** — `db/migrations/0011_record_text.sql`

```sql
-- Doc-page full text (spec 2026-10-02-realufo-doc-fulltext). One row per PDF
-- processed by crawler ingest.fulltext; pages='[]' when no page passed the
-- OCR quality filter (so it isn't retried).
CREATE TABLE record_text (
  record_id   TEXT PRIMARY KEY REFERENCES records(id),
  pages       TEXT NOT NULL,
  truncated   INTEGER NOT NULL DEFAULT 0,
  total_pages INTEGER NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- [ ] **Step 2: Write the failing tests**

`worker/tests/schema.spec.ts` line 4 — add `"record_text"` before `"records"` (SQLite binary order: `_` < `s`):

```ts
const EXPECTED = ["archives","ask_cache","assets","boards","cases","comments","posts","presence","rate_events","record_text","records","sightings","stats","text_index","threads","ticker","users","votes","x_posts"];
```

`worker/tests/records.spec.ts` — inside `describe("records", …)`:

```ts
  it("loadRecord parses stored full text; null without a row", async () => {
    await env.DB.prepare("INSERT INTO record_text(record_id,pages,truncated,total_pages) VALUES('FBI-UAP-D003',?,1,12)")
      .bind(JSON.stringify([{ n: 2, text: "Page two text" }]))
      .run();
    const d: any = await loadRecord(env as any, "FBI-UAP-D003");
    expect(d.fullText).toEqual({ pages: [{ n: 2, text: "Page two text" }], truncated: true, total_pages: 12 });
    const none: any = await loadRecord(env as any, "FBI-UAP-D002");
    expect(none.fullText).toBeNull();
  });
```

`worker/tests/ssr.spec.ts` — inside `describe("docBody", …)`:

```ts
  it("renders full text pages escaped, with continuation link only when truncated", () => {
    const ft = { pages: [{ n: 3, text: "Para one line\nline two\n\n\n\n<script>x</script>\n\n  \n" }], truncated: true, total_pages: 40 };
    const out = docBody(doc({}, { fullText: ft }));
    expect(out).toContain(
      "<section><h2>Full text</h2><h3>Page 3</h3><p>Para one line<br>line two</p><p>&lt;script&gt;x&lt;/script&gt;</p>"
    );
    expect(out).not.toContain("<p></p>");
    expect(out).toContain('<a href="/api/file/FBI-UAP-D002">Text continues in the original file (40 pages).</a>');
    expect(docBody(doc({}, { fullText: { ...ft, truncated: false } }))).not.toContain("Text continues");
  });
  it("no Full text section for an empty or missing fullText", () => {
    expect(docBody(doc({}, { fullText: { pages: [], truncated: false, total_pages: 2 } }))).not.toContain("Full text");
    expect(docBody(doc())).not.toContain("Full text");
  });
```

`worker/tests/meta.spec.ts` — inside `describe("pre-rendered body", …)` (its `get` helper defaults to `Accept: */*`):

```ts
  it("doc pre-render includes stored full text", async () => {
    await env.DB.prepare("INSERT INTO record_text(record_id,pages,truncated,total_pages) VALUES('ICA-UAP-D001',?,0,1)")
      .bind(JSON.stringify([{ n: 1, text: "Analysts reviewed the Colorado Springs sighting." }]))
      .run();
    const html = await get("/doc/ICA-UAP-D001");
    expect(html).toContain("<h3>Page 1</h3><p>Analysts reviewed the Colorado Springs sighting.</p>");
  });
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run --config worker/vitest.config.ts`
Expected: the new records/ssr/meta tests FAIL (`fullText` undefined; no "Full text" section; no `<h3>Page 1</h3>`); schema passes (migration from Step 1 + updated EXPECTED). "no such table: record_text" means the migration isn't picked up — check its name/location.

- [ ] **Step 4: Implement `loadRecord`** — in `worker/routes/records.ts`, extend the `Promise.all` and the return:

```ts
  const [assets, promoted, series, release, related, text] = await Promise.all([
    env.DB.prepare("SELECT role,cdn_url,mime,width,height,duration FROM assets WHERE record_id=?").bind(id).all(),
    env.DB.prepare(
      `SELECT t.id,t.no,t.title,t.stance,t.votes,t.source_record_id,b.slug boardSlug,b.accent accent
                    FROM threads t JOIN boards b ON b.id=t.board_id WHERE t.source_record_id=?`
    )
      .bind(id)
      .all(),
    seriesNav(env, id),
    releaseP,
    releaseP.then((rel) => relatedOf(env, record, rel)),
    env.DB.prepare("SELECT pages,truncated,total_pages FROM record_text WHERE record_id=?")
      .bind(id)
      .first<{ pages: string; truncated: number; total_pages: number }>(),
  ]);
  // Quality-filtered PDF text (crawler ingest.fulltext); null until extracted.
  const fullText = text
    ? { pages: JSON.parse(text.pages) as { n: number; text: string }[], truncated: !!text.truncated, total_pages: text.total_pages }
    : null;
  return { record, assets: assets.results, promotedThreads: promoted.results, series, release, related, fullText };
```

- [ ] **Step 5: Implement the pre-render section** — in `worker/lib/ssr.ts`:

Add to `DocData` (after `related`):

```ts
  fullText?: { pages: { n: number; text: string }[]; truncated: boolean; total_pages: number } | null;
```

Add above `docBody`:

```ts
// Blank-line-separated paragraphs; single newlines kept as <br>.
const textBlock = (t: string) =>
  t
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${p.split("\n").map(esc).join("<br>")}</p>`)
    .join("");

function fullTextSection(d: DocData): string {
  const ft = d.fullText;
  if (!ft?.pages.length) return "";
  const more = ft.truncated
    ? `<p>${a({ href: `/api/file/${encodeURIComponent(d.record.id)}`, text: `Text continues in the original file (${ft.total_pages} pages).` })}</p>`
    : "";
  return `<section><h2>Full text</h2>${ft.pages.map((p) => `<h3>Page ${p.n}</h3>${textBlock(p.text)}`).join("")}${more}</section>`;
}
```

In `docBody`'s array, insert `fullTextSection(d),` right after the "Open original file" line:

```ts
    `<p>${a({ href: `/api/file/${encodeURIComponent(r.id)}`, text: "Open original file" })}</p>`,
    fullTextSection(d),
```

- [ ] **Step 6: Run the worker suite + typecheck**

Run: `npx vitest run --config worker/vitest.config.ts` then `npx tsc --noEmit`
Expected: all pass; tsc clean.

- [ ] **Step 7: Commit**

```bash
git add db/migrations/0011_record_text.sql worker/routes/records.ts worker/lib/ssr.ts worker/tests/schema.spec.ts worker/tests/records.spec.ts worker/tests/ssr.spec.ts worker/tests/meta.spec.ts
git commit -m "feat(doc): record_text table; doc API + pre-render carry quality-filtered full text"
```

---

### Task 3: SPA Full text block

**Files:**
- Create: `web/src/components/FullText.tsx`
- Modify: `web/src/api/types.ts` (`RecordDetail`)
- Modify: `web/src/screens/Doc.tsx` (render after the OPEN ORIGINAL button, before `{/* series prev/next`)
- Test: `web/src/tests/doc.test.tsx`

**Interfaces:**
- Consumes: `RecordDetail.fullText` from `GET /api/records/:id` (Task 2).
- Produces: `export interface FullText` in `web/src/api/types.ts`; default export `FullText({ data, onOpenOriginal })` component.

- [ ] **Step 1: Write the failing tests** — append inside `describe("Doc", …)` in `web/src/tests/doc.test.tsx`:

```tsx
  it("shows FULL TEXT: first page visible, the rest in a closed <details>, continuation when truncated", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    useRecordMock.mockReturnValue({
      data: {
        ...mockDetail,
        fullText: {
          pages: [{ n: 1, text: "First page words <script>x</script>" }, { n: 4, text: "Fourth page words" }],
          truncated: true,
          total_pages: 9,
        },
      },
      isLoading: false,
    });
    const { container } = renderDoc();
    expect(screen.getByText("FULL TEXT")).toBeInTheDocument();
    expect(screen.getByText("2 of 9 pages · OCR, may contain errors")).toBeInTheDocument();
    expect(screen.getByText("First page words <script>x</script>")).toBeVisible();
    const details = container.querySelector("section[aria-label='Full text'] details")!;
    expect(details.hasAttribute("open")).toBe(false);
    expect(details.textContent).toContain("Fourth page words");
    fireEvent.click(screen.getByRole("button", { name: "Text continues in the original file →" }));
    expect(openSpy).toHaveBeenCalledWith("/api/file/rec1", "_blank", "noopener,noreferrer");
    openSpy.mockRestore();
  });

  it("hides FULL TEXT when there is none or no page passed the filter", () => {
    renderDoc();
    expect(screen.queryByText("FULL TEXT")).toBeNull();
    useRecordMock.mockReturnValue({
      data: { ...mockDetail, fullText: { pages: [], truncated: false, total_pages: 3 } },
      isLoading: false,
    });
    renderDoc();
    expect(screen.queryByText("FULL TEXT")).toBeNull();
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `PATH=$HOME/.nvm/versions/node/v22.22.0/bin:$PATH pnpm -C web test -- src/tests/doc.test.tsx`
Expected: first new test FAILS (`Unable to find an element with the text: FULL TEXT`); the "hides" test passes already (pins behaviour). TypeScript may flag `fullText` on `RecordDetail` only at tsc time, not in vitest.

- [ ] **Step 3: Types** — `web/src/api/types.ts`, add above `export interface RecordDetail`:

```ts
/** Quality-filtered PDF text (crawler ingest.fulltext), capped ~30k chars. */
export interface FullText {
  pages: { n: number; text: string }[];
  /** true when readable text continues in the original file */
  truncated: boolean;
  total_pages: number;
}
```

and inside `RecordDetail` (after `related?`):

```ts
  /** Null until extracted; empty pages when no page passed the OCR filter. */
  fullText?: FullText | null;
```

- [ ] **Step 4: Component** — `web/src/components/FullText.tsx`

```tsx
import type { FullText as FullTextData } from "../api/types";

// PDF text under the doc summary (spec 2026-10-02-realufo-doc-fulltext). The
// same pages the Worker pre-renders for crawlers; pages after the first sit
// in a native <details>, which keeps them in the DOM while collapsed.
export default function FullText({
  data,
  onOpenOriginal,
}: {
  data: FullTextData | null | undefined;
  onOpenOriginal: () => void;
}) {
  if (!data?.pages.length) return null;
  const [first, ...rest] = data.pages;
  const page = (p: { n: number; text: string }) => (
    <div key={p.n} className="mb-4">
      <div className="mb-1 font-mono text-[9px] tracking-[.5px] text-faint">PAGE {p.n}</div>
      <p className="text-[13.5px] leading-[1.65] text-dim" style={{ whiteSpace: "pre-line", overflowWrap: "anywhere" }}>
        {p.text}
      </p>
    </div>
  );
  return (
    <section aria-label="Full text" className="mb-[22px]">
      <div className="mb-2 flex items-baseline justify-between gap-3 font-mono">
        <h2 className="text-[11px] font-semibold tracking-[.5px] text-ink">FULL TEXT</h2>
        <span className="text-[10px] text-faint">
          {data.pages.length} of {data.total_pages} pages · OCR, may contain errors
        </span>
      </div>
      {page(first)}
      {rest.length > 0 && (
        <details className="mb-4">
          <summary className="cursor-pointer font-mono text-xs text-ink">Show all {data.pages.length} pages</summary>
          <div className="mt-3">{rest.map(page)}</div>
        </details>
      )}
      {data.truncated && (
        <button
          type="button"
          onClick={onOpenOriginal}
          className="w-full rounded-xl border border-line2 py-3 font-mono text-xs font-semibold text-ink active:scale-[.99]"
        >
          Text continues in the original file →
        </button>
      )}
    </section>
  );
}
```

Note: the span's text is several React text nodes; `getByText` matches on the element's combined text, so the test string must equal the rendered sentence exactly.

- [ ] **Step 5: Wire into Doc** — `web/src/screens/Doc.tsx`: add `import FullText from "../components/FullText";` with the other component imports, and insert directly before the line `{/* series prev/next — id neighbours (D029 ← D030 → D031), uapbrowser-style */}`:

```tsx
      <FullText data={detail.fullText} onOpenOriginal={handleOpenOriginal} />

```

- [ ] **Step 6: Run web tests + typecheck**

Run: `PATH=$HOME/.nvm/versions/node/v22.22.0/bin:$PATH pnpm -C web test` then `PATH=$HOME/.nvm/versions/node/v22.22.0/bin:$PATH pnpm -C web exec tsc --noEmit -p .`
Expected: all web tests pass (including both new ones); tsc clean. If `tsc -p .` isn't how web typechecks, use `pnpm -C web build` (runs `tsc -b && vite build`) instead.

- [ ] **Step 7: Commit**

```bash
git add web/src/components/FullText.tsx web/src/api/types.ts web/src/screens/Doc.tsx web/src/tests/doc.test.tsx
git commit -m "feat(doc): FULL TEXT block — first page shown, rest in <details>, matches the pre-render"
```

---

### Task 4: Daily CI step + rollout (prod steps need user go-ahead)

**Files:**
- Modify: `.github/workflows/ingest.yml` (new step after `textindex`)

**Interfaces:**
- Consumes: `python -m ingest.fulltext` (Task 1); migration 0011 (Task 2); deployed Worker/SPA (Tasks 2–3).
- Produces: live full text on realufo.org.

- [ ] **Step 1: CI step** — in `.github/workflows/ingest.yml`, insert after the `textindex` step's `run:` block and before `- uses: actions/upload-artifact@v4`:

```yaml
      # Doc-page full text: live PDFs without a record_text row (spec 2026-10-02-realufo-doc-fulltext)
      - name: fulltext
        if: ${{ !cancelled() }}
        working-directory: crawler
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          LIVE: ${{ github.event_name == 'schedule' || github.event.inputs.dry_run == 'false' }}
        run: |
          set -o pipefail
          if [ "$LIVE" = "true" ]; then
            python -m ingest.fulltext | tee -a ingest-summary.txt
          else
            python -m ingest.fulltext --dry-run --limit 1 | tee -a ingest-summary.txt
          fi
```

Check: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ingest.yml'))" && echo ok` → `ok`. (poppler-utils is already installed by the workflow's apt step.)

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ingest.yml
git commit -m "ci(ingest): daily fulltext step after textindex"
```

- [ ] **Step 3: STOP — ask the user** before any prod action. Report first:
  - `env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID npx wrangler d1 migrations list realufo-db --remote --env-file /dev/null` → which migrations are pending. If anything other than 0011 is pending (e.g. 0010 x_posts from the X-bot chat), say so — applying it is that chat's rollout decision.
  - `wrangler.jsonc` `FEATURE_X` / `triggers.crons` values and `wrangler deployments list` (latest) — deploying HEAD ships whatever else is on the branch.

- [ ] **Step 4: Apply migration** (after go-ahead): `env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID npx wrangler d1 migrations apply realufo-db --remote --env-file /dev/null` → `0011_record_text.sql ✅`.

- [ ] **Step 5: Deploy from a clean worktree of HEAD** (needs `pnpm install` in root AND `pnpm -C web install`):

```bash
W=<scratchpad>/realufo-deploy-ft
git worktree add --detach "$W" build/app-foundation
cd "$W" && pnpm install --frozen-lockfile && pnpm -C web install --frozen-lockfile
env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID pnpm run deploy
```

Expected: `Current Version ID: …`. Docs render exactly as before (no rows yet).

- [ ] **Step 6: Backfill** — from the main checkout's `crawler/` (the repo `.env` token has D1 scope):

```bash
cd crawler && set -a && . ../.env && set +a
python3 -m ingest.fulltext --dry-run --limit 5
python3 -m ingest.fulltext
```

Expected: dry run prints `pages=k/n chars=…` lines; live run ends `fulltext ok=<~550> failed=0` (a few failures are acceptable — rerun to retry). Spot-check: `npx wrangler d1 execute realufo-db --remote --command "SELECT count(*), sum(pages='[]'), sum(truncated) FROM record_text"`.

- [ ] **Step 7: Verify live** (page cache may serve pre-backfill data for up to 1h; test docs not visited since deploy, or wait):

```bash
curl -s -A Googlebot https://realufo.org/doc/DOW-UAP-D129 | grep -o "<h2>Full text</h2>\|<h3>Page [0-9]*</h3>" | head -3
curl -s -A Googlebot "https://realufo.org/doc/18100754General1946-7Vol2" | grep -o "<h3>Page [0-9]*</h3>" | head -3
```

Expected: Full text heading and page headings. Then open one doc in the browser pane: FULL TEXT block under OPEN ORIGINAL, "Show all N pages" expands, no console errors.

- [ ] **Step 8: Clean up** `git worktree remove "$W"`; record the deployed version and backfill counts in the project-state memory.
