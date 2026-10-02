"""Links between records: war.gov's own "Related Media" + "Same topic".

    python3 -m ingest.links --dry-run --show AARO-IMG-Go_Fast_UAP   # print neighbours, no writes
    python3 -m ingest.links                                         # rewrite record_links

source='official': the war.gov CSV's "Video Pairing" / "PDF Pairing" columns
(pipe-separated file codes). Matched exactly on the code (war.gov's own page
substring-matches, so "PR11" also hits PR110-119). A PDF and a video can share
a code (DOW-UAP-PR019), so Video Pairing codes prefer videos and PDF Pairing
codes prefer PDFs/images, falling back to any kind (the columns aren't strict:
Video Pairing also names PDFs like DOW-UAP-D077). Unresolvable codes are files we don't
have (audio, unmirrored) and are counted, not fatal.

source='topic': TF-IDF over words + word pairs of title (x3), official summary and AI summary.
Only terms in 2..5% of records count, so shared names ("go fast", "mt etna",
"gimbal") link files while the corpus-wide UAP vocabulary doesn't. (bge-m3
embeddings were tried first: every record scored 0.6-0.75 against every other.)
Each record keeps its TOP_K neighbours scoring >= MIN_SCORE. The whole table is
recomputed each run (~600 records, seconds, no API), so links are symmetric
and a new record shows up on its neighbours' pages the day it lands.
"""
import argparse, csv, math, re, sys, tempfile
from collections import Counter
from . import d1
from .textindex import flush

SELECT = """SELECT r.id, r.kind, r.title, r.summary, rt.ai_summary FROM records r
LEFT JOIN record_text rt ON rt.record_id=r.id WHERE r.status='live' ORDER BY r.id"""
TOP_K = 6
MIN_SCORE = 0.15
MAX_DF = 0.05
TITLE_WEIGHT = 3
FLUSH_EVERY = 500
# CSV typos whose plain normalisation hits a different file
ALIASES = {"DOW-UAP-PR-101": "DOW-UAP-D101"}  # IIR for PR117-122 (blurb names D101; PR101 is a video)
STOP = set("""the a an of and or to in on for with by at from as is was were be been this that it its are
uap uaps ufo ufos object objects unidentified anomalous phenomena aerial video image document report""".split())

def terms(text) -> list[str]:
    w = [x for x in re.findall(r"[a-z0-9]+", (text or "").lower()) if len(x) > 1 and x not in STOP]
    return w + [f"{a}_{b}" for a, b in zip(w, w[1:])]

def vectors(rows: list[dict]) -> list[dict[str, float]]:
    bags = []
    for r in rows:
        c = Counter()
        for t in terms(r.get("title")):
            c[t] += TITLE_WEIGHT
        c.update(terms(r.get("summary")) + terms(r.get("ai_summary")))
        bags.append(c)
    n = len(rows)
    df = Counter(t for b in bags for t in b)
    idf = {t: math.log(n / d) for t, d in df.items() if 1 < d <= max(2, n * MAX_DF)}
    out = []
    for b in bags:
        v = {t: (1 + math.log(c)) * idf[t] for t, c in b.items() if t in idf}
        norm = math.sqrt(sum(x * x for x in v.values())) or 1.0
        out.append({t: x / norm for t, x in v.items()})
    return out

def code_key(code: str) -> str:
    """'DoW-UAP-D010' / 'PR-019' / 'FBI Photo B011' -> comparable key."""
    k = re.sub(r"[^A-Z0-9]", "", ALIASES.get(code.strip(), code).upper())
    k = re.sub(r"(?<![0-9])0+(?=[0-9])", "", k)
    return "DOWUAP" + k if re.fullmatch(r"PR\d+[A-Z]?", k) else k

def official_pairs(csv_rows, rows):
    """-> ({(id, other_id)} both directions, [unresolved codes])."""
    index: dict[tuple[bool, str], set[str]] = {}
    for r in rows:
        for c in (r["id"], (r.get("title") or "").split(",")[0]):
            index.setdefault((r.get("kind") == "video", code_key(c)), set()).add(r["id"])
    def find(is_video: bool, code: str) -> set[str]:
        k = code_key(code)
        return index.get((is_video, k)) or index.get((not is_video, k)) or set()
    pairs, missing = set(), []
    for c in csv_rows:
        me = find((c.get("Type") or "").strip() == "VID", (c.get("Title") or "").split(",")[0])
        for col, is_video in (("Video Pairing", True), ("PDF Pairing", False)):
            for code in filter(None, (x.strip() for x in (c.get(col) or "").split("|"))):
                code = code.split(",")[0]  # "ODNI-UAP-D001, USPER Narrative, ..." = a title
                them = find(is_video, code)
                if not them:
                    missing.append(code)
                for a in me:
                    for b in them or ():
                        if a != b:
                            pairs |= {(a, b), (b, a)}
    return pairs, sorted(set(missing))

def neighbours(rows: list[dict], top_k: int = TOP_K, min_score: float = MIN_SCORE):
    """id -> [(other_id, score)] best first, self excluded."""
    ids, vecs = [r["id"] for r in rows], vectors(rows)
    found: dict[str, list[tuple[str, float]]] = {i: [] for i in ids}
    for a in range(len(ids)):
        va = vecs[a]
        for b in range(a + 1, len(ids)):
            vb = vecs[b]
            small, big = (va, vb) if len(va) < len(vb) else (vb, va)
            s = sum(x * big.get(t, 0.0) for t, x in small.items())
            if s >= min_score:
                found[ids[a]].append((ids[b], s))
                found[ids[b]].append((ids[a], s))
    return {i: sorted(l, key=lambda t: -t[1])[:top_k] for i, l in found.items()}

def rows_sql(links: dict, official: set = frozenset()) -> list[str]:
    out = ["DELETE FROM record_links;"]
    out += [f"INSERT INTO record_links(record_id,related_id,score,source) VALUES"
            f"({d1.sql_q(a)},{d1.sql_q(b)},1,'official');" for a, b in sorted(official)]
    for rid, ns in links.items():
        out += [f"INSERT INTO record_links(record_id,related_id,score,source) VALUES"
                f"({d1.sql_q(rid)},{d1.sql_q(o)},{s:.4f},'topic');" for o, s in ns if (rid, o) not in official]
    return out

def load_csv_rows() -> list[dict]:
    from .cli import CSV_PATHS
    from .sources import wargov
    with tempfile.TemporaryDirectory() as work:
        return [r for p in wargov.refresh_csvs(work, CSV_PATHS) for r in csv.DictReader(open(p, encoding="utf-8-sig"))]

def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="score and print; no D1 writes")
    ap.add_argument("--show", nargs="*", default=[], help="print these ids' best neighbours (any score)")
    args = ap.parse_args(argv)
    rows = d1._d1_json(" ".join(SELECT.split()))
    if args.show:
        loose = neighbours(rows, top_k=10, min_score=0.0)
        for sid in args.show:
            print(sid, [(o, round(s, 3)) for o, s in loose.get(sid, [])])
    official, missing = official_pairs(load_csv_rows(), rows)
    for sid in args.show:
        print(sid, "official:", sorted(b for a, b in official if a == sid))
    links = neighbours(rows)
    print(f"{'dry-run ' if args.dry_run else ''}links records={len(rows)} official={len(official)} "
          f"topic_linked={sum(1 for l in links.values() if l)} topic={sum(map(len, links.values()))} "
          f"unresolved_codes={len(missing)} {missing[:20]}")
    if args.dry_run:
        return
    sql = rows_sql(links, official)
    with tempfile.TemporaryDirectory() as work:
        # the DELETE rides in the first file; a failed later file leaves a partial table until the next run
        for i in range(0, len(sql), FLUSH_EVERY):
            flush(sql[i:i + FLUSH_EVERY], work)

if __name__ == "__main__":
    sys.exit(main())
