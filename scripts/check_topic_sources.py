#!/usr/bin/env python3
"""Verify topic sources (worker/lib/topicText.ts) against prod D1: every id exists
and is live, and every page is within the file's page count (record_text.total_pages)."""
import json, re, subprocess, sys

src = open("worker/lib/topicText.ts").read()
pairs = re.findall(r'\{\s*id:\s*"([^"]+)"(?:,\s*page:\s*(\d+))?', src)
ids = sorted({i for i, _ in pairs})
sql = ("SELECT r.id, r.status, t.total_pages FROM records r LEFT JOIN record_text t ON t.record_id=r.id "
       "WHERE r.id IN (" + ",".join("'" + i.replace("'", "''") + "'" for i in ids) + ")")
out = subprocess.run(["npx", "wrangler", "d1", "execute", "realufo-db", "--remote", "--json", "--command", sql],
                     capture_output=True, text=True).stdout
rows = {r["id"]: r for r in json.loads(out[out.index("["):out.rindex("]") + 1])[0]["results"]}
bad = []
for i, p in pairs:
    r = rows.get(i)
    if not r or r["status"] != "live":
        bad.append(f"{i}: missing or not live")
    elif p and r["total_pages"] and int(p) > int(r["total_pages"]):
        bad.append(f"{i}: page {p} > {r['total_pages']} pages")
print("\n".join(bad) or f"ok: {len(pairs)} sources, {len(ids)} files")
sys.exit(1 if bad else 0)
