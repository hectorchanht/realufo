# One-off: apply db/fixes/2026-10-03-agency-location-cleanup.sql, then re-stamp
# record_tldr.input_hash for rows whose TL;DR was current before, so the change
# (agency short form / location spelling) doesn't trigger TL;DR + card regen.
# Run from crawler/: python3 ../db/fixes/2026-10-03-agency-location-cleanup.py [--apply]  (no flag = dry run)
import re, sys, json
sys.path.insert(0, ".")
from ingest import d1
from ingest.tldr import SELECT, build_input, input_hash

FIX = "../db/fixes/2026-10-03-agency-location-cleanup.sql"
ids = sorted(set(re.findall(r"'([^']+)'", "".join(l.split("WHERE id IN", 1)[1] for l in open(FIX) if l.startswith("UPDATE")))))
id_sql = " AND r.id IN (" + ",".join(d1.sql_q(i) for i in ids) + ")"

def rows():
    return d1._d1_json(SELECT.format(ids=id_sql).replace("ORDER BY random()", ""))

before = rows()
current = {r["id"]: r["input_hash"] for r in before if r["input_hash"] and r["input_hash"] == input_hash(build_input(r))}
print(f"{len(ids)} ids, {len(before)} live w/ text, {len(current)} with current TL;DR hash")
if "--apply" not in sys.argv:
    sys.exit(0)
d1.apply_sql(FIX)
upd = []
for r in rows():
    old = current.get(r["id"])
    new = input_hash(build_input(r))
    if old and new != old:
        upd.append(f"UPDATE record_tldr SET input_hash={d1.sql_q(new)} WHERE record_id={d1.sql_q(r['id'])} AND lang='en' AND input_hash={d1.sql_q(old)};")
print(f"re-stamping {len(upd)} TL;DR hashes")
if upd:
    d1.execute("".join(upd))
