#!/usr/bin/env python3
"""Collect a daily Cloudflare metrics snapshot for realufo.org and write one
JSON object to --out (the workflow appends it to metrics/cf-snapshots.jsonl
on the ops/metrics branch).

Read-only: zone analytics (24h), Worker invocations/errors (24h),
Workers AI neurons per day (last 7d), R2 bucket storage (latest).
Every section degrades to {"error": ...} instead of failing the run.
Only stdlib is used.
"""

import argparse
import json
import os
import sys
import urllib.request
import urllib.error
from datetime import datetime, timedelta, timezone

API = "https://api.cloudflare.com/client/v4"


def req(method, path, token, payload=None):
    url = API + path
    data = json.dumps(payload).encode() if payload is not None else None
    r = urllib.request.Request(
        url, data=data, method=method,
        headers={"Authorization": "Bearer " + token,
                 "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as e:
        try:
            body = json.load(e)
        except Exception:
            body = {"raw": "unparseable"}
        return {"success": False, "http_status": e.code, "body": body}


def graphql(token, query, variables):
    out = req("POST", "/graphql", token,
              {"query": query, "variables": variables})
    if not out.get("success", True):
        return None, "http %s: %s" % (out.get("http_status"),
                                      json.dumps(out.get("body"))[:200])
    if out.get("errors"):
        return None, "graphql: %s" % json.dumps(out["errors"])[:300]
    try:
        return out["data"]["viewer"]["accounts"][0], None
    except (KeyError, IndexError, TypeError):
        return None, "unexpected shape: %s" % json.dumps(out)[:300]


Q_WORKER = """query($accountTag: string!, $scriptName: string!, $start: Time!, $end: Time!) {
  viewer { accounts(filter: {accountTag: $accountTag}) {
    workersInvocationsAdaptive(limit: 100,
      filter: {scriptName: $scriptName, datetime_geq: $start, datetime_leq: $end}) {
      sum { requests errors } } } } }"""

Q_AI = """query($accountTag: string!, $start: Time!, $end: Time!) {
  viewer { accounts(filter: {accountTag: $accountTag}) {
    aiInferenceAdaptiveGroups(limit: 100,
      filter: {datetime_geq: $start, datetime_leq: $end}) {
      sum { totalNeurons } } } } }"""

Q_R2 = """query($accountTag: string!, $bucket: string!, $start: Time!, $end: Time!) {
  viewer { accounts(filter: {accountTag: $accountTag}) {
    r2StorageAdaptiveGroups(limit: 10, orderBy: [datetime_DESC],
      filter: {bucketName: $bucket, datetime_geq: $start, datetime_leq: $end}) {
      max { payloadSize metadataSize objectCount }
      dimensions { datetime } } } } }"""


def iso(dt):
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="output JSON file (one object)")
    ap.add_argument("--zone", default=os.environ.get("ZONE_NAME", "realufo.org"))
    ap.add_argument("--bucket", default=os.environ.get("BUCKET_NAME", "realufo"))
    ap.add_argument("--worker", default=os.environ.get("WORKER_NAME", "realufo"))
    args = ap.parse_args()

    token = os.environ["CLOUDFLARE_API_TOKEN"]
    account = os.environ["CLOUDFLARE_ACCOUNT_ID"]
    now = datetime.now(timezone.utc)
    today = now.date().isoformat()

    snap = {"date": today, "collected_at_utc": iso(now),
            "zone_name": args.zone, "errors": []}

    # 1. zone id + 24h analytics
    z = req("GET", "/zones?name=" + args.zone, token)
    try:
        zone_id = z["result"][0]["id"]
        snap["zone_id"] = zone_id
    except (KeyError, IndexError, TypeError):
        zone_id = None
        snap["errors"].append("zone lookup: %s" % json.dumps(z)[:200])

    if zone_id:
        a = req("GET", "/zones/%s/analytics/dashboard?since=-1440" % zone_id,
                token)
        try:
            t = a["result"]["totals"]
            rq, bw = t["requests"], t["bandwidth"]
            snap["zone_24h"] = {
                "requests": rq["all"],
                "visitors": t["uniques"]["all"],
                "pageviews": t["pageviews"]["all"],
                "bandwidth_gb": round(bw["all"] / 1e9, 3),
                "cache_hit_pct": (round(rq["cached"] / rq["all"] * 100, 2)
                                  if rq["all"] else 0),
                "threats_blocked": t["threats"]["all"],
            }
        except (KeyError, TypeError):
            snap["errors"].append("zone analytics: %s" % json.dumps(a)[:200])

    # 2. worker invocations / errors, trailing 24h
    acct, err = graphql(token, Q_WORKER, {
        "accountTag": account, "scriptName": args.worker,
        "start": iso(now - timedelta(hours=24)), "end": iso(now)})
    if err:
        snap["errors"].append("worker analytics: " + err)
    else:
        try:
            s = acct["workersInvocationsAdaptive"][0]["sum"]
            snap["worker_24h"] = {"name": args.worker,
                                  "invocations": s["requests"],
                                  "errors": s["errors"]}
        except (KeyError, IndexError, TypeError):
            snap["errors"].append("worker analytics: empty result set")

    # 3. Workers AI neurons, last 7 calendar days (UTC; quota resets 00:00 UTC)
    ai_days = []
    for i in range(7):
        day = (now - timedelta(days=i)).date()
        ds = iso(datetime(day.year, day.month, day.day, tzinfo=timezone.utc))
        de = iso(datetime(day.year, day.month, day.day,
                          tzinfo=timezone.utc) + timedelta(days=1))
        acct, err = graphql(token, Q_AI,
                            {"accountTag": account, "start": ds, "end": de})
        if err:
            snap["errors"].append("ai neurons %s: %s" % (day, err))
            ai_days.append({"date": day.isoformat(), "neurons": None})
            continue
        try:
            n = acct["aiInferenceAdaptiveGroups"][0]["sum"]["totalNeurons"]
            ai_days.append({"date": day.isoformat(), "neurons": n})
        except (KeyError, IndexError, TypeError):
            ai_days.append({"date": day.isoformat(), "neurons": None})
    snap["ai_neurons_7d"] = sorted(ai_days, key=lambda d: d["date"])

    # 4. R2 storage, latest reading in last 48h
    acct, err = graphql(token, Q_R2, {
        "accountTag": account, "bucket": args.bucket,
        "start": iso(now - timedelta(hours=48)), "end": iso(now)})
    if err:
        snap["errors"].append("r2 storage: " + err)
    else:
        try:
            row = acct["r2StorageAdaptiveGroups"][0]
            m = row["max"]
            total = (m["payloadSize"] or 0) + (m["metadataSize"] or 0)
            snap["r2"] = {"bucket": args.bucket,
                          "bytes": total,
                          "gb": round(total / 1e9, 3),
                          "objects": m["objectCount"],
                          "as_of": row["dimensions"]["datetime"]}
        except (KeyError, IndexError, TypeError):
            snap["errors"].append("r2 storage: empty result set")

    with open(args.out, "w") as f:
        f.write(json.dumps(snap, separators=(",", ": ")) + "\n")
    print(json.dumps(snap, indent=2))
    if snap["errors"]:
        print("SECTIONS WITH ERRORS: %d" % len(snap["errors"]),
              file=sys.stderr)


if __name__ == "__main__":
    main()
