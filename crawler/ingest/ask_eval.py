"""Golden-set retrieval check for Ask the Archive (run before launch, and when
tuning ASK_MIN_SCORE). Needs FEATURE_ASK=hidden or on. Each question costs
one answer (~$0.0003) unless cached.

    python3 -m ingest.ask_eval --base https://realufo.org
"""
import argparse, json, pathlib, sys, urllib.parse, urllib.request

GOLDEN = pathlib.Path(__file__).parent / "data" / "ask_golden.json"

def score(golden: list[dict], answers: dict[str, dict]) -> tuple[float, list[str]]:
    misses = [g["q"] for g in golden
              if not {s["record_id"] for s in answers.get(g["q"], {}).get("sources", [])} & set(g["expect"])]
    return (len(golden) - len(misses)) / len(golden), misses

def fetch_answer(base: str, q: str) -> dict:
    req = urllib.request.Request(f"{base}/api/ask?q={urllib.parse.quote(q)}", headers={"X-Anon-Id": "ask-eval"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read())
    except Exception as e:
        print(f"ERR  {q}: {e}")
        return {"sources": []}

def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="https://realufo.org")
    args = ap.parse_args(argv)
    golden = json.loads(GOLDEN.read_text())
    answers = {g["q"]: fetch_answer(args.base, g["q"]) for g in golden}
    for g in golden:
        got = [s["record_id"] for s in answers[g["q"]].get("sources", [])]
        print(f"{'ok  ' if set(got) & set(g['expect']) else 'MISS'} {g['q']}\n     got={got}")
    recall, misses = score(golden, answers)
    print(f"recall@8 = {recall:.0%} ({len(golden) - len(misses)}/{len(golden)})")
    ocr = [g for g in golden if g.get("ocr_only")]
    if ocr:  # questions only re-OCR'd pages can answer (spec 2026-10-03-realufo-paddleocr-reocr)
        r_ocr, m_ocr = score(ocr, answers)
        print(f"ocr-only recall@8 = {r_ocr:.0%} ({len(ocr) - len(m_ocr)}/{len(ocr)})")
    sys.exit(0 if recall >= 0.7 else 1)

if __name__ == "__main__":
    main()
