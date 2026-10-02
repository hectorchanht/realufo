#!/usr/bin/env python3
"""Ping IndexNow (Bing, Yandex, Seznam, Naver...) with every URL in the live sitemap.

Usage: python3 crawler/indexnow.py [url ...]   # no args = whole sitemap
Run after a deploy or a release that adds files. Google doesn't use IndexNow;
it reads the sitemap submitted in Search Console.
The key must match web/public/<key>.txt (served at https://realufo.org/<key>.txt).
"""
import json
import re
import sys
import urllib.request

HOST = "realufo.org"
# api.indexnow.org 403s urllib's default "Python-urllib" User-Agent.
UA = {"user-agent": "realufo-indexnow/1.0 (+https://realufo.org)"}
KEY = "15c819920fcebcf77e8010d63ce74426"


def sitemap_urls():
    with urllib.request.urlopen(urllib.request.Request(f"https://{HOST}/sitemap.xml", headers=UA)) as r:
        return re.findall(r"<loc>([^<]+)</loc>", r.read().decode())


def main():
    urls = sys.argv[1:] or sitemap_urls()
    body = json.dumps({"host": HOST, "key": KEY, "keyLocation": f"https://{HOST}/{KEY}.txt", "urlList": urls[:10000]})
    req = urllib.request.Request(
        "https://api.indexnow.org/indexnow", data=body.encode(), headers={**UA, "content-type": "application/json; charset=utf-8"}
    )
    with urllib.request.urlopen(req) as r:
        print(r.status, f"submitted {len(urls)} urls")


if __name__ == "__main__":
    main()
