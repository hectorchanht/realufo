"""Topic links between records ("Same topic" group on the doc page).

    python3 -m ingest.links --dry-run --show AARO-IMG-Go_Fast_UAP   # print neighbours, no writes
    python3 -m ingest.links                                         # rewrite record_links

TF-IDF over words + word pairs of title (x3), official summary and AI summary.
Only terms in 2..5% of records count, so shared names ("go fast", "mt etna",
"gimbal") link files while the corpus-wide UAP vocabulary doesn't. (bge-m3
embeddings were tried first: every record scored 0.6-0.75 against every other.)
Each record keeps its TOP_K neighbours scoring >= MIN_SCORE. The whole table is
recomputed each run (~600 records, seconds, no API), so links are symmetric
and a new record shows up on its neighbours' pages the day it lands.
"""
import argparse, math, re, sys, tempfile
from collections import Counter
from . import d1
from .textindex import flush

SELECT = """SELECT r.id, r.title, r.summary, rt.ai_summary FROM records r
LEFT JOIN record_text rt ON rt.record_id=r.id WHERE r.status='live' ORDER BY r.id"""
TOP_K = 6
MIN_SCORE = 0.15
MAX_DF = 0.05
TITLE_WEIGHT = 3
FLUSH_EVERY = 500
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

def rows_sql(links: dict) -> list[str]:
    out = ["DELETE FROM record_links;"]
    for rid, ns in links.items():
        out += [f"INSERT INTO record_links(record_id,related_id,score) VALUES"
                f"({d1.sql_q(rid)},{d1.sql_q(o)},{s:.4f});" for o, s in ns]
    return out

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
    links = neighbours(rows)
    print(f"{'dry-run ' if args.dry_run else ''}links records={len(rows)} "
          f"linked={sum(1 for l in links.values() if l)} rows={sum(map(len, links.values()))}")
    if args.dry_run:
        return
    sql = rows_sql(links)
    with tempfile.TemporaryDirectory() as work:
        # the DELETE rides in the first file; a failed later file leaves a partial table until the next run
        for i in range(0, len(sql), FLUSH_EVERY):
            flush(sql[i:i + FLUSH_EVERY], work)

if __name__ == "__main__":
    sys.exit(main())
