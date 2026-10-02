#!/usr/bin/env python3
"""Resolve one war.gov release's DVIDS video ids -> DOD asset ids, and
optionally mirror the mp4s to R2.

    python resolve-dvids.py 9/18/26 r06            # writes dvids-maps/dvids2dod-r06.json
    python resolve-dvids.py 9/18/26 r06 --mirror   # + upload missing DOD_<id>.mp4 to R2

Reads the LIVE war.gov CSV. Each DVIDS page links the source mp4 on the
war.gov CloudFront host; the mp4 is stored as videos/wargov/DOD_<id>.mp4,
which is the URL the ingest's wargov adapter expects. Once the map is
committed, `python -m ingest --sources wargov` inserts the D1 records.

Run locally: DVIDS blocks GitHub Actions IPs. Idempotent: cached map
entries and files already in R2 are skipped. AUD rows are skipped until
records.kind supports audio.
"""
import csv, json, os, re, sys, tempfile, time
from curl_cffi import requests
from ingest import fetch, r2
from ingest.models import R2_BASE
from ingest.sources.wargov import CSV_URLS

HERE = os.path.dirname(os.path.abspath(__file__))
MP4_RE = re.compile(r'https://d34w7g4gy10iej\.cloudfront\.net/video/\d+/DOD_(\d+)/DOD_\1\.mp4')

def main(release_date, tag, mirror):
    out_path = os.path.join(HERE, "dvids-maps", f"dvids2dod-{tag}.json")
    mapping = json.load(open(out_path)) if os.path.exists(out_path) else {}
    with tempfile.TemporaryDirectory() as work:
        csv_path = os.path.join(work, "uap-data.csv")
        fetch.download(CSV_URLS[0][0], csv_path)
        ids = sorted({(r.get("DVIDS Video ID") or "").strip()
                      for r in csv.DictReader(open(csv_path, encoding="utf-8-sig"))
                      if (r.get("Release Date") or "").strip() == release_date
                      and (r.get("Type") or "").strip() == "VID"} - {""}, key=int)
        print(f"{release_date}: {len(ids)} VID ids, {len(mapping)} cached")
        failed = 0
        for d in ids:
            mp4 = None
            if d not in mapping or mirror:
                m = MP4_RE.search(requests.get(f"https://www.dvidshub.net/video/{d}",
                                               impersonate="chrome", timeout=30).text)
                if not m:
                    print(f"  {d} -> ?? (no DOD mp4 on DVIDS page)"); failed += 1; continue
                mapping[d], mp4 = m.group(1), m.group(0)
                time.sleep(0.5)  # courtesy delay
            key = f"videos/wargov/DOD_{mapping[d]}.mp4"
            if mirror and not fetch.head_ok(f"{R2_BASE}/{key}"):
                tmp = os.path.join(work, os.path.basename(key))
                fetch.download(mp4, tmp)
                r2.put(key, tmp, "video/mp4")
                os.remove(tmp)
                ok = fetch.head_ok(f"{R2_BASE}/{key}")
                failed += not ok
                print(f"  {d} -> {mapping[d]} {'uploaded' if ok else 'UPLOAD NOT VISIBLE'}")
            else:
                print(f"  {d} -> {mapping[d]}")
    with open(out_path, "w") as f:
        json.dump({k: mapping[k] for k in sorted(mapping, key=int)}, f, indent=2)
        f.write("\n")
    print(f"wrote {out_path} ({len(mapping)} entries), failed={failed}")
    return 1 if failed else 0

if __name__ == "__main__":
    a = [x for x in sys.argv[1:] if x != "--mirror"]
    if len(a) != 2:
        sys.exit(__doc__)
    sys.exit(main(a[0], a[1], "--mirror" in sys.argv))
