#!/usr/bin/env python3
"""Ping IndexNow (Bing, Yandex, Seznam, Naver...) with every URL in the live sitemap.

Usage: python3 crawler/indexnow.py [url ...]            # no args = whole sitemap
       cd crawler && python3 indexnow.py --since-hours 26 [--dry-run]
--since-hours (daily ingest CI step) submits only pages whose content changed:
docs of records added or given full text in that window, the docs linking to
them (their related groups changed), and, if any, every non-doc sitemap page
(home, archive, hubs list counts and new files). Needs wrangler + a D1 token.
Run after a deploy or a release that adds files. Google doesn't use IndexNow;
it reads the sitemap submitted in Search Console.
The key must match web/public/<key>.txt (served at https://realufo.org/<key>.txt).
"""
import argparse
import json
import re
import sys
import urllib.parse
import urllib.request

HOST = "realufo.org"
# api.indexnow.org 403s urllib's default "Python-urllib" User-Agent.
UA = {"user-agent": "realufo-indexnow/1.0 (+https://realufo.org)"}
KEY = "15c819920fcebcf77e8010d63ce74426"


def sitemap_urls():
    with urllib.request.urlopen(urllib.request.Request(f"https://{HOST}/sitemap.xml", headers=UA)) as r:
        return re.findall(r"<loc>([^<]+)</loc>", r.read().decode())


CHANGED_SQL = """SELECT id FROM records WHERE status='live' AND created_at >= datetime('now', '-{h} hours')
UNION SELECT record_id FROM record_text WHERE created_at >= datetime('now', '-{h} hours')"""


def changed_urls(hours: int) -> list[str]:
    from ingest import d1  # run from crawler/
    ids = {r["id"] for r in d1._d1_json(" ".join(CHANGED_SQL.format(h=int(hours)).split()))}
    if not ids:
        return []
    q = ",".join(d1.sql_q(i) for i in sorted(ids))
    ids |= {r["id"] for r in d1._d1_json(f"SELECT DISTINCT record_id id FROM record_links WHERE related_id IN ({q})")}
    locs = [u.replace("&amp;", "&") for u in sitemap_urls()]
    doc_id = lambda u: urllib.parse.unquote(u.split("/doc/", 1)[1])
    return [u for u in locs if "/doc/" not in u or doc_id(u) in ids]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("urls", nargs="*")
    ap.add_argument("--since-hours", type=int, default=None)
    ap.add_argument("--dry-run", action="store_true", help="print the URLs, don't submit")
    args = ap.parse_args()
    urls = args.urls or (changed_urls(args.since_hours) if args.since_hours else sitemap_urls())
    if not urls:
        print("indexnow: nothing changed")
        return
    if args.dry_run:
        print(f"indexnow dry-run: would submit {len(urls)} urls", *urls[:10], sep="\n  ")
        return
    body = json.dumps({"host": HOST, "key": KEY, "keyLocation": f"https://{HOST}/{KEY}.txt", "urlList": urls[:10000]})
    req = urllib.request.Request(
        "https://api.indexnow.org/indexnow", data=body.encode(), headers={**UA, "content-type": "application/json; charset=utf-8"}
    )
    with urllib.request.urlopen(req) as r:
        print(r.status, f"submitted {len(urls)} urls")


if __name__ == "__main__":
    main()
