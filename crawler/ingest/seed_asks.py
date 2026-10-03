"""Seed shared Ask answers (Spec 8 §4). Answers come from the live API, so they are real.

    python3 -m ingest.seed_asks --ask [--out seed_asks.json]   # ask each question, save for review
    python3 -m ingest.seed_asks --share 12 15 19               # publish reviewed answers, print their URLs
    python3 -m ingest.seed_asks --to-local                     # copy prod's shared answers into local D1

Run from crawler/. --ask costs one AI answer per uncached question.
"""
import argparse, json, pathlib, subprocess, tempfile, time, urllib.parse, urllib.request
from ingest import d1

BASE = "https://realufo.org"
ANON = "realufo-seed"  # one fixed browser id: --share must come from the asker
UA = "realufo-seed/1.0 (+https://realufo.org)"
QUESTIONS = pathlib.Path(__file__).parent / "data" / "ask_seed.json"
REPO = pathlib.Path(__file__).resolve().parents[2]  # wrangler.jsonc + local D1 state live here
COLS = ("id", "question", "actor_id", "sources", "cached", "public", "created_at", "answer")


def _api(path: str, body: dict | None = None) -> dict:
    req = urllib.request.Request(
        BASE + path,
        data=None if body is None else json.dumps(body).encode(),
        headers={"X-Anon-Id": ANON, "user-agent": UA, "content-type": "application/json"},
        method="GET" if body is None else "POST",
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def ask_all(out: str) -> None:
    rows = []
    for q in json.loads(QUESTIONS.read_text()):
        try:
            a = _api("/api/ask?q=" + urllib.parse.quote(q))
        except Exception as e:
            print(f"ERR  {q}: {e}")
            continue
        srcs = a.get("sources", [])
        rows.append({"log_id": a.get("log_id"), "question": q, "sources": [s["record_id"] for s in srcs], "answer": a.get("answer")})
        print(f"{a.get('log_id')!s:>6}  {len(srcs)} src  {q}")
        time.sleep(4)  # per-browser limit is 20/min
    pathlib.Path(out).write_text(json.dumps(rows, indent=2, ensure_ascii=False))
    print(f"saved {len(rows)} answers to {out} — read every one before --share")


def share(ids: list[int]) -> None:
    for i in ids:
        print(BASE + _api(f"/api/ask/{int(i)}/public", {"public": True})["url"])


def local_sql(rows: list[dict]) -> str:
    cols = ",".join(COLS)
    return "".join(f"INSERT OR REPLACE INTO ask_log({cols}) VALUES({','.join(d1.sql_q(r[c]) for c in COLS)});\n" for r in rows)


def to_local() -> None:
    rows = d1._d1_json(f"SELECT {','.join(COLS)} FROM ask_log WHERE public=1 AND answer IS NOT NULL")
    with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False) as f:
        f.write(local_sql(rows))
    subprocess.run(["wrangler", "d1", "execute", "realufo-db", "--local", "--file", f.name], check=True, cwd=REPO)
    print(f"copied {len(rows)} shared answers to local D1")


def main(argv=None):
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--ask", action="store_true")
    g.add_argument("--share", nargs="+", type=int, metavar="ID")
    g.add_argument("--to-local", action="store_true")
    ap.add_argument("--out", default="seed_asks.json")
    args = ap.parse_args(argv)
    if args.ask:
        ask_all(args.out)
    elif args.share:
        share(args.share)
    else:
        to_local()


if __name__ == "__main__":
    main()
