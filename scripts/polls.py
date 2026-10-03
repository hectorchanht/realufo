#!/usr/bin/env python3
"""Story polls (Spec 9), read-only: where each poll is posted and how it's doing.

  python3 scripts/polls.py              every story with a poll: site votes, X + Threads links/results
  python3 scripts/polls.py SLUG         one story
  python3 scripts/polls.py --room SLUG  max question length for SLUG (the "<q> Vote → link" line
                                        must fit the last X tweet: 280 weighted)

Never writes, never prints tokens. Social counts are the cron's cached reads (~every 20 h).
"""
import importlib.util, json, os, subprocess, sys, urllib.parse, urllib.request

ROOT = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, check=True).stdout.strip()
spec = importlib.util.spec_from_file_location("article", os.path.join(ROOT, "scripts/article.py"))
article = importlib.util.module_from_spec(spec)
spec.loader.exec_module(article)
d1, q = article.d1, article.q
X_URL = "https://x.com/realufoorg/status/{}"  # the bot account


def threads_permalink(media_id, token):
    url = f"https://graph.threads.net/v1.0/{media_id}?" + urllib.parse.urlencode({"fields": "permalink", "access_token": token})
    try:
        return json.load(urllib.request.urlopen(url, timeout=15)).get("permalink") or f"(media {media_id})"
    except Exception as e:
        return f"(media {media_id}; permalink lookup failed: {type(e).__name__})"


def split(counts, total, opts):
    if not total:
        return "no votes yet"
    return " · ".join(f"{o} {round(c * 100 / total)}%" for o, c in zip(opts, counts)) + f"  ({total} votes)"


def main():
    args = sys.argv[1:]
    if args[:1] == ["--room"] and len(args) == 2:
        a = json.load(open(os.path.join(ROOT, "showcase/articles", args[1], "article.json")))
        base = article.weighted_len(a["parts"][-1] + article.cta({**a, "poll": {"q": ""}}, f"ar_{args[1]}"))
        return print(f"{args[1]}: question ≤ {min(100, 280 - base)} chars (X weighted; emoji = 2)")
    where = f"AND a.slug={q(args[0])}" if args else ""
    stories = d1(f"SELECT a.slug, a.poll FROM articles a WHERE a.poll IS NOT NULL {where} ORDER BY a.created_at", read=True)
    if not stories:
        return print("no story with a poll" + (f" for {args[0]}" if args else ""))
    social = d1("SELECT slug, platform, status, remote_id, counts, total, closes_at, error FROM poll_social", read=True)
    votes = d1("SELECT slug, opt, count(*) n FROM poll_votes GROUP BY slug, opt", read=True)
    # is the story itself out on each platform? (the cron only polls stories that are)
    live = {r["slug"]: r for r in d1(
        """SELECT a.slug, max(x.status='posted') x, max(sp.status='posted' AND sp.deleted_at IS NULL) threads
           FROM articles a JOIN threads t ON t.id=a.thread_id
           LEFT JOIN x_posts x ON x.stream='showcase' AND x.ref=t.source_record_id
           LEFT JOIN social_posts sp ON sp.x_post_id=x.id AND sp.platform='threads'
           WHERE a.poll IS NOT NULL GROUP BY a.slug""", read=True)}
    token = None
    if any(s["platform"] == "threads" and s["remote_id"] for s in social):
        rows = d1("SELECT access_token FROM social_auth WHERE platform='threads'", read=True)
        token = rows[0]["access_token"] if rows else None
    for st in stories:
        p = json.loads(st["poll"])
        tally = [0] * len(p["opts"])
        for v in votes:
            if v["slug"] == st["slug"] and v["opt"] < len(tally):
                tally[v["opt"]] = v["n"]
        print(f"\n== {st['slug']}: {p['q']}")
        print(f"   site     https://realufo.org/thread/ar_{st['slug']}  {split(tally, sum(tally), p['opts'])}")
        for plat in ("x", "threads"):
            r = next((s for s in social if s["slug"] == st["slug"] and s["platform"] == plat), None)
            if not r:
                why = ("queued: the cron posts one poll per platform every 3 h (oldest story first)"
                       if (live.get(st["slug"]) or {}).get(plat) else f"story itself not on {plat} yet: no poll until it is")
                print(f"   {plat:<8} not posted — {why}")
                continue
            link = (X_URL.format(r["remote_id"]) if plat == "x" else threads_permalink(r["remote_id"], token)) if r["remote_id"] else "-"
            res = split(json.loads(r["counts"]), r["total"], p["opts"]) if r["counts"] else "not read yet"
            extra = f"  ERROR {r['error'][:120]}" if r["error"] and r["status"] != "posted" else ""
            print(f"   {plat:<8} {r['status']:<7} {link}  {res}{'  (final)' if r['status'] == 'closed' else ''}{extra}")


if __name__ == "__main__":
    main()
