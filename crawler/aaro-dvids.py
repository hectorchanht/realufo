#!/usr/bin/env python3
"""Fix AARO video metadata from DVIDS.

The old crawler stamped every AARO clip with the GIMBAL page's metadata
("NAVAIR - FOIA: Unresolved Case: GIMBAL Video"). AARO's Official UAP
Imagery page embeds each clip's DVIDS id; each DVIDS page has the real
title, description, date taken, VIRIN and the DOD_<id> filename that matches
our videos/aaro/DOD_<id>.mp4 records.

    python aaro-dvids.py            # refresh dvids-maps/aaro-dvids.json, print planned changes
    python aaro-dvids.py --apply    # + write them to remote D1

Run locally (DVIDS blocks GitHub Actions). Clips with no DVIDS page found get
an honest neutral title instead of the wrong GIMBAL one.
"""
import json, os, re, sys, tempfile, time
from curl_cffi import requests
from ingest import d1
from ingest.dvids import BAD_TITLE, neutral_sql, parse_page, update_sql

HERE = os.path.dirname(os.path.abspath(__file__))
MAP = os.path.join(HERE, "dvids-maps", "aaro-dvids.json")
IMAGERY = "https://www.aaro.mil/UAP-Cases/Official-UAP-Imagery/"
# AARO uploads not (or no longer) listed on aaro.mil, found by web search (2026-10-02):
# Unresolved UAP Report: Middle East 2023 / 2024, Al Taqaddum Object ("jellyfish"), Middle East Red Balloon 2024
EXTRA_DVIDS = ["961723", "962722", "960331", "964843"]


def get(url):
    r = requests.get(url, impersonate="chrome", timeout=60)
    r.raise_for_status()
    return r.text


def main(apply):
    mapping = json.load(open(MAP)) if os.path.exists(MAP) else {}
    ids = set(re.findall(r"dvidshub\.net/(?:video|embed)/(\d+)", get(IMAGERY))) | set(EXTRA_DVIDS)
    for d in sorted(ids - set(mapping), key=int):
        meta = parse_page(get(f"https://www.dvidshub.net/video/{d}"))
        if meta["dod"] and meta["title"]:
            mapping[d] = meta
            print(f"dvids {d}: DOD_{meta['dod']} {meta['title']}")
        time.sleep(1)  # be polite to DVIDS
    os.makedirs(os.path.dirname(MAP), exist_ok=True)
    json.dump(dict(sorted(mapping.items(), key=lambda kv: int(kv[0]))), open(MAP, "w"), indent=1, ensure_ascii=False)
    by_dod = {m["dod"]: m for m in mapping.values()}

    rows = d1._d1_json("SELECT r.id, r.title, a.cdn_url FROM records r JOIN assets a ON a.record_id=r.id "
                       "AND a.role='full' WHERE r.archive='aaro' AND r.kind='video'")
    sql, fixed, neutral = [], 0, 0
    for r in rows:
        dod = (re.search(r"DOD_(\d+)", r["cdn_url"] or "") or [None, None])[1]
        if dod in by_dod:
            sql.append(update_sql(r["id"], by_dod[dod]))
            fixed += 1
            print(f"fix     {r['id']}: {by_dod[dod]['title']}")
        elif dod and (r["title"] or "").startswith(BAD_TITLE):
            sql.append(neutral_sql(r["id"], dod))
            neutral += 1
            print(f"neutral {r['id']}: DOD_{dod} (no DVIDS page found)")
    print(f"aaro videos={len(rows)} fixed={fixed} neutral={neutral} map={len(mapping)}")
    if apply and sql:
        path = os.path.join(tempfile.gettempdir(), "aaro-dvids.sql")
        open(path, "w").write("\n".join(sql) + "\n")
        d1.apply_sql(path)
        print("applied to remote D1")


if __name__ == "__main__":
    main("--apply" in sys.argv[1:])
