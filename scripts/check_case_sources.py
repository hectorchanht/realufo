#!/usr/bin/env python3
"""Verify case story sources (worker/lib/caseStoryText.ts): every id exists and is
live in prod D1 with page <= its page count; every url answers HTTP < 400."""
import json, re, subprocess, sys, urllib.error, urllib.request

src = open("worker/lib/caseStoryText.ts").read()
ids = re.findall(r'\{\s*id:\s*"([^"]+)"(?:,\s*page:\s*(\d+))?', src)
urls = sorted(set(re.findall(r'url:\s*"([^"]+)"', src)))
bad = []
if ids:
    q = ",".join("'" + i.replace("'", "''") + "'" for i in sorted({i for i, _ in ids}))
    out = subprocess.run(["npx", "wrangler", "d1", "execute", "realufo-db", "--remote", "--json", "--command",
                          f"SELECT r.id, r.status, t.total_pages FROM records r LEFT JOIN record_text t ON t.record_id=r.id WHERE r.id IN ({q})"],
                         capture_output=True, text=True).stdout
    rows = {r["id"]: r for r in json.loads(out[out.index("["):out.rindex("]") + 1])[0]["results"]}
    for i, p in ids:
        r = rows.get(i)
        if not r or r["status"] != "live": bad.append(f"{i}: missing or not live")
        elif p and r["total_pages"] and int(p) > int(r["total_pages"]): bad.append(f"{i}: page {p} > {r['total_pages']}")
warn = []
for u in urls:
    err, code = "", None
    for method in ("HEAD", "GET"):
        try:
            with urllib.request.urlopen(urllib.request.Request(u, method=method, headers={"User-Agent": "Mozilla/5.0 (realufo-check/1.0)"}), timeout=20) as r:
                code = r.status
                if r.status < 400: break
        except urllib.error.HTTPError as e:
            code, err = e.code, str(e)
        except Exception as e:
            code, err = None, str(e)
    else:
        # Bot walls (401/403/429) and dropped connections (site maintenance) aren't dead
        # links: warn. 404/410/5xx are.
        (warn if code in (None, 401, 403, 429) else bad).append(f"{u}: {err}")
for w in warn: print("WARN", w)
print("\n".join(bad) or f"ok: {len(ids)} archive sources, {len(urls)} urls")
sys.exit(1 if bad else 0)
