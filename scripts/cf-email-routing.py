#!/usr/bin/env python3
"""Cloudflare Email Routing ops for Hector's 11 domains.
status: print destination addresses + per-zone routing state + existing rules.
apply:  enable routing per zone, add DNS records, create the planned routes.

Usage (in GitHub Actions with repo secrets):
  CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... python3 cf-email-routing.py status|apply
"""
import json, os, sys, urllib.request, urllib.error

TOKEN = os.environ["CLOUDFLARE_API_TOKEN"]
ACCT = os.environ["CLOUDFLARE_ACCOUNT_ID"]
BASE = "https://api.cloudflare.com/client/v4"

DOMAINS = ["hectorchan.com", "moneyrate.lol", "pennyvest.space", "realufo.org",
           "openmusic.lol", "ownerledgr.com", "globalnewsshorts.com", "holdr.lol",
           "clipbin.lol", "watchthenight.com", "strangedocs.com"]

# local-part plan per domain (pennyvest.space: parked, skipped)
PLAN = {
    "hectorchan.com": ["hello"],            # already live
    "realufo.org": ["hello", "tips", "press"],
    "moneyrate.lol": ["hello", "support"],
    "openmusic.lol": ["hello", "support"],
    "globalnewsshorts.com": ["hello", "tips"],
    "watchthenight.com": ["hello"],
    "strangedocs.com": ["hello", "tips"],
    "clipbin.lol": ["hello"],
    "holdr.lol": ["hello", "support"],
    "ownerledgr.com": ["hello"],
}

def api(method, path, body=None):
    req = urllib.request.Request(
        BASE + path,
        data=(json.dumps(body).encode() if body is not None else None),
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
        method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        return {"_error": e.code, "_body": e.read().decode()[:600]}

def dest_addresses():
    return api("GET", f"/accounts/{ACCT}/email/routing/addresses")

def zone_id(name, zones):
    for z in zones:
        if z["name"] == name:
            return z["id"]
    return None

def routing_status(zid):
    return api("GET", f"/zones/{zid}/email/routing")

def routing_rules(zid):
    return api("GET", f"/zones/{zid}/email/routing/rules")

def existing_to_addrs(rules_resp):
    """Return set of local-parts already routed (literal 'to' matchers)."""
    got = set()
    res = rules_resp.get("result") or []
    for rule in res:
        for m in rule.get("matchers", []) or []:
            if m.get("type") == "literal" and m.get("field") == "to":
                got.add(m.get("value", "").split("@")[0])
    return got

def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "status"
    addrs = dest_addresses()
    print("== destination addresses ==")
    verified_uuid = None
    for a in (addrs.get("result") or []):
        print(f"  {a.get('email')} verified={a.get('verified')} id={a.get('id')}")
        if a.get("verified"):
            verified_uuid = a.get("id")
    if addrs.get("_error"):
        print("  ERROR:", addrs); return

    zones = (api("GET", f"/accounts/{ACCT}/zones?per_page=50").get("result") or [])
    print(f"\n== zones found: {len(zones)} ==")
    for d in DOMAINS:
        zid = zone_id(d, zones)
        if not zid:
            print(f"  {d}: NO ZONE"); continue
        st = routing_status(zid)
        if st.get("_error"):
            print(f"  {d}: status error {st['_error']}"); continue
        enabled = (st.get("result") or {}).get("enabled")
        rules = routing_rules(zid)
        have = existing_to_addrs(rules) if not rules.get("_error") else {"ERR"}
        want = PLAN.get(d, [])
        print(f"  {d}: routing_enabled={enabled} have={sorted(have)} want={want}")
        if mode == "apply" and d in PLAN:
            if not verified_uuid:
                print("    SKIP: no verified destination address"); continue
            if not enabled:
                r = api("POST", f"/zones/{zid}/email/routing/enable", {"enabled": True})
                print("    enable:", r.get("success"), r.get("_error", ""))
            dns = api("POST", f"/zones/{zid}/email/routing/dns", {"enabled": True})
            print("    dns records:", dns.get("success"), dns.get("_error", ""))
            for lp in want:
                if lp in have:
                    print(f"    {lp}@ exists, skip"); continue
                r = api("POST", f"/zones/{zid}/email/routing/rules", {
                    "name": f"{lp}@ -> verified destination",
                    "enabled": True,
                    "matchers": [{"type": "literal", "field": "to", "value": f"{lp}@{d}"}],
                    "actions": [{"type": "forward", "value": [verified_uuid]}],
                })
                print(f"    create {lp}@{d}:", r.get("success"), r.get("_error", ""),
                      (r.get("errors") or [{}])[0].get("message", "") if not r.get("success") else "")

if __name__ == "__main__":
    main()
