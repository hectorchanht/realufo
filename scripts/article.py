#!/usr/bin/env python3
"""Publish an article (publish-article skill): showcase/articles/<slug>/article.json.

  python3 scripts/article.py SLUG            images → R2, rows (articles, article_records, site
                                              thread: OP = story, one reply per evidence) → a job
  python3 scripts/article.py SLUG --social   …plus the Short (→ R2) as an X thread, mirrored to
                                              every enabled platform

Nothing is written to D1 or posted until the owner taps ✅ on the Telegram preview (POST /__job);
the Worker then writes the rows, pings IndexNow and (with --social) posts the Short.

Idempotent: image keys are uuid5(slug/file), rows are upserts, the site thread is made once
(articles.thread_id), and a showcase is posted once per record.

Layout: <slug>/article.json, research.md, images/ (hero + evidence crops, uploaded), short/ (short.py,
app-*.png, short.mp4). article.json: slug, title, hero ("images/hero.jpg"), short ("short/short.mp4", for --social), showcase_record (the record
the X post hangs off), parts (the story; X thread tweets, each ≤280), evidence: [{id, t?, label,
evidence, image?}].
poll (optional): {q, opts} — the story's crowd question (q ≤100, 2-4 opts ≤25 chars, unique); site
poll + an X poll reply (worker/lib/xpoll.ts, X_POLLS=on). Opts are frozen once anyone voted.
"""
import json, os, re, subprocess, sys, tempfile, urllib.error, urllib.request, uuid
from datetime import datetime, timezone

ROOT = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, check=True).stdout.strip()
SITE = "https://realufo.org"
WR = ["npx", "wrangler"]
WR_OPTS = ["--remote", "--env-file", "/dev/null"]  # .env's narrow API token can't reach D1/R2; use the OAuth login
SEP = "\n---\n"  # worker/lib/x.ts THREAD_SEP


def q(v):
    return "NULL" if v is None else str(v) if isinstance(v, (int, float)) else "'" + str(v).replace("'", "''") + "'"


def d1(sql, read=False):
    with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False) as f:
        f.write(sql)
    args = [*WR, "d1", "execute", "realufo-db", *WR_OPTS, "--json", "-y", "--file" if not read else "--command", f.name if not read else sql]
    out = subprocess.run(args, cwd=ROOT, capture_output=True, text=True)
    os.unlink(f.name)
    if out.returncode:
        sys.exit(f"D1 failed: {out.stderr[-800:]}")
    # --file prints upload progress first, and wrangler may print notices after the JSON
    d = json.JSONDecoder().raw_decode(re.search(r"^[\[{].*", out.stdout, re.S | re.M)[0])[0]
    return (d[0] if isinstance(d, list) else d).get("results", [])


def upload(slug, name):
    if not name:
        return None
    # key from the file name only (not "images/…"): stable across folder moves, same as before the layout change
    key = f"uploads/{uuid.uuid5(uuid.NAMESPACE_URL, f'realufo-article/{slug}/{os.path.basename(name)}')}.jpg"
    subprocess.run([*WR, "r2", "object", "put", f"realufo/{key}", "--file", os.path.join(ROOT, "showcase/articles", slug, name),
                    "--content-type", "image/jpeg", "--cache-control", "public, max-age=2592000", *WR_OPTS],
                   cwd=ROOT, check=True, capture_output=True)
    return key


def doc_link(e):
    t = e.get("t")
    if e.get("page") is not None:
        return f"{SITE}/doc/{e['id']}?p={e['page']}"
    return f"{SITE}/doc/{e['id']}" + (f"?t={t:g}" if t is not None else "")


def poll_error(p):
    """Same rules as worker/routes/polls.ts parsePoll (X's limits). None = valid."""
    if not isinstance(p, dict) or not isinstance(p.get("q"), str) or not isinstance(p.get("opts"), list):
        return "poll must be {q, opts: [...]}"
    q, opts = p["q"].strip(), [o.strip() if isinstance(o, str) else o for o in p["opts"]]
    if not q or len(q) > 100:
        return "poll.q must be 1-100 chars"
    if not 2 <= len(opts) <= 4:
        return "poll needs 2-4 opts"
    if any(not isinstance(o, str) or not o or len(o) > 25 for o in opts):
        return "each poll opt must be 1-25 chars"
    if len(set(opts)) != len(opts):
        return "poll opts must be unique"
    return None


def weighted_len(text):
    """X's weighted length, as worker/lib/xcopy.ts weightedLength: a URL = 23, emoji/CJK = 2."""
    n = 0
    rest = re.sub(r"https?://\S+", "", text)
    n += 23 * len(re.findall(r"https?://\S+", text))
    for ch in rest:
        c = ord(ch)
        n += 1 if c <= 0x10FF or 0x2000 <= c <= 0x200D or 0x2010 <= c <= 0x201F or 0x2032 <= c <= 0x2037 else 2
    return n


def last_part_error(a, thread):
    """The X thread's last tweet = last part + CTA. Over 280, xcopy fit() would cut off the link."""
    n = weighted_len(a["parts"][-1] + cta(a, thread))
    return f"last part + Vote/Full-story line is over by {n - 280} (X weighted); shorten it or the poll question" if n > 280 else None


def freeze_error(stored, n, new):
    """Once anyone voted (site or social poll), the opts can't change: a vote is an index into them.
    stored/new = poll JSON or None. The question wording may still change."""
    if not n:
        return None
    opts = lambda p: p and json.loads(p)["opts"]
    if not stored or not new or opts(stored) != opts(new):
        return "poll opts are frozen: votes or a social poll exist (only the question wording may change)"
    return None


def cta(a, thread):
    """Last line of the social caption: the poll question as a Vote link, else the story link."""
    url = f"{SITE}/thread/{thread}"
    return f"\n{a['poll']['q'].strip()} Vote → {url}" if a.get("poll") else f"\nFull story: {url}"


# Site boards (D1 `boards`). Every article names its own: gov = official
# documents, vids = footage/photos, skeptic = debunks, cases = classic
# incidents, intl = non-US, uap = general. No default, so nothing lands on
# /uap/ by accident.
BOARDS = ("uap", "gov", "vids", "skeptic", "intl", "cases", "meta")


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    slug, social = sys.argv[1], "--social" in sys.argv[2:]
    a = json.load(open(os.path.join(ROOT, "showcase/articles", slug, "article.json")))
    assert a["slug"] == slug and a["parts"] and a["evidence"], "article.json: slug/parts/evidence"
    if a.get("board") not in BOARDS:
        sys.exit(f"article.json: \"board\" must be one of {', '.join(BOARDS)}")
    poll = a.get("poll")
    if poll and (err := poll_error(poll)):
        sys.exit(f"article.json: {err}")
    poll_json = poll and json.dumps({"q": poll["q"].strip(), "opts": [o.strip() for o in poll["opts"]]}, ensure_ascii=False)
    if social and (err := last_part_error(a, f"ar_{slug}")):
        sys.exit(f"article.json: {err}")
    ids =[e["id"] for e in a["evidence"]]
    found = {r["id"] for r in d1(f"SELECT id FROM records WHERE status='live' AND id IN ({','.join(map(q, ids))})", read=True)}
    if missing := [i for i in ids if i not in found]:
        sys.exit(f"not live records: {missing}")
    token = next((l.split("=", 1)[1].strip() for l in open(os.path.join(ROOT, ".env")) if l.startswith("ADMIN_TOKEN=")), "")
    if not token:
        sys.exit("ADMIN_TOKEN is not in .env (scripts/publish.sh prints the one-time setup)")
    rec = a.get("showcase_record") if social else None
    # before any upload: an R2 object that is posted, or shown by a waiting preview, is never overwritten
    if waiting := d1(f"""SELECT id FROM bot_jobs WHERE deleted_at IS NULL AND status NOT IN ('posted','skipped','failed')
                         AND ((stream='article' AND ref={q(slug)}) OR (stream='showcase' AND ref={q(rec)}))""", read=True):
        sys.exit(f"a preview is already waiting on Telegram: job {waiting[0]['id']} (tap it or /skip {waiting[0]['id']})")
    if social:
        if d1(f"SELECT 1 FROM x_posts WHERE stream='showcase' AND ref={q(rec)}", read=True):
            sys.exit(f"showcase already posted for {rec}; refusing to overwrite its R2 video")
        live = d1(f"SELECT archive FROM records WHERE id={q(rec)} AND status='live'", read=True)
        if not live:
            sys.exit(f"showcase_record {rec} is not live")
    cur = d1(f"""SELECT a.poll, (SELECT count(*) FROM poll_votes WHERE slug={q(slug)}) + (SELECT count(*) FROM poll_social WHERE slug={q(slug)}) n
                 FROM articles a WHERE a.slug={q(slug)}""", read=True)
    if cur and (err := freeze_error(cur[0]["poll"], cur[0]["n"], poll_json)):
        sys.exit(err)

    print(f"== images → R2 ({slug})")
    hero = upload(slug, a.get("hero"))
    imgs = {e["id"]: upload(slug, e.get("image")) for e in a["evidence"]}

    print("== rows (written on ✅)")
    sql = [f"""INSERT INTO articles(slug,title,body,image_key,poll) VALUES({q(slug)},{q(a['title'])},{q(SEP.join(a['parts']))},{q(hero)},{q(poll_json)})
               ON CONFLICT(slug) DO UPDATE SET title=excluded.title, body=excluded.body, image_key=excluded.image_key, poll=excluded.poll;""",
           f"DELETE FROM article_records WHERE slug={q(slug)};"]  # the article's own evidence list, rewritten as a whole
    sql += [f"INSERT INTO article_records(slug,record_id,pos,t,page,label,evidence,image_key) VALUES({q(slug)},{q(e['id'])},{i},{q(e.get('t'))},{q(e.get('page'))},{q(e['label'])},{q(e['evidence'])},{q(imgs[e['id']])});"
            for i, e in enumerate(a["evidence"])]
    story_sql = sql

    # Site thread, Reddit-style: OP = the story (thread numbering dropped) + hero; one reply per piece of
    # evidence, its doc link (with ?t=) embeds the record at that moment. Made once, text refreshed on re-runs.
    thread = f"ar_{slug}"
    op = "\n\n".join(re.sub(r"^\d+/\s*", "", p) for p in a["parts"])
    replies = [(f"{thread}_{i}", f"{e['label']}\n\n{e['evidence']}\n\n{doc_link(e)}", imgs[e["id"]]) for i, e in enumerate(a["evidence"], 1)]
    # no articles row yet (the story insert waits for ✅ too) = new thread; its UPDATE articles runs after the story insert in the same batch
    made = d1(f"SELECT thread_id FROM articles WHERE slug={q(slug)}", read=True)
    if made and made[0]["thread_id"]:
        print("== site thread (refresh text)")
        rows = [f"UPDATE threads SET title={q(a['title'][:120])}, op_body={q(op)}, board_id={q(a['board'])} WHERE id={q(thread)};",
                f"UPDATE posts SET body={q(op)} WHERE id={q(thread + '_op')};"]
        rows += [f"UPDATE posts SET body={q(b)} WHERE id={q(pid)};" for pid, b, _ in replies]
    else:
        print("== site thread")
        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        no = int(datetime.now().timestamp()) % 9000 + 24419000
        src = a.get("showcase_record") or ids[0]
        rows = [f"""INSERT INTO threads(id,no,board_id,title,stance,op_body,op_handle,op_id,tags,votes,reply_count,img_count,source_record_id,hot,created_at)
                    VALUES({q(thread)},{no},{q(a['board'])},{q(a['title'][:120])},'analyst',{q(op)},'RealUFO',{q(thread + '_op')},'[]',0,{len(ids)},{len([k for k in [hero, *imgs.values()] if k])},{q(src)},0,{q(now)});""",
                f"""INSERT INTO posts(id,no,thread_id,body,handle,stance,votes,source_record_id,image_r2_key,image_kind,is_op,created_at)
                    VALUES({q(thread + '_op')},{no},{q(thread)},{q(op)},'RealUFO','analyst',0,{q(src)},{q(hero)},{q(hero and 'upload')},1,{q(now)});"""]
        rows += [f"""INSERT INTO posts(id,no,thread_id,body,handle,stance,votes,image_r2_key,image_kind,is_op,created_at)
                    VALUES({q(pid)},{no + i},{q(thread)},{q(b)},'RealUFO','analyst',0,{q(img)},{q(img and 'upload')},0,{q(now)});"""
                 for i, (pid, b, img) in enumerate(replies, 1)]
        rows.append(f"UPDATE articles SET thread_id={q(thread)} WHERE slug={q(slug)};")
    thread_sql = rows
    print(f"   {SITE}/thread/{thread}")
    if poll:
        print(f"   poll: {poll['q'].strip()} 👇  [{' / '.join(poll['opts'])}]  (X reply once X_POLLS=on)")

    urls = [f"{SITE}/thread/{thread}", *[f"{SITE}/doc/{i}" for i in ids]]
    # one statement per item (DB.batch); story before thread: the thread's UPDATE articles needs the story row
    payload = {"sql": [s.strip().rstrip(";") for s in [*story_sql, *thread_sql]], "urls": urls}
    media = {"key": hero, "mime": "image/jpeg", "size": 0} if hero else None
    caption = f"{a['title']}\n\n{op}" + (f"\n\npoll: {poll['q']} [{' / '.join(poll['opts'])}]" if poll else "")
    if social:
        key = f"showcase/{live[0]['archive']}/{rec}.mp4"
        print(f"== Short → R2 ({key})")
        subprocess.run([*WR, "r2", "object", "put", f"realufo/{key}", "--file", os.path.join(ROOT, "showcase/articles", slug, a["short"]),
                        "--content-type", "video/mp4", "--cache-control", "public, max-age=2592000", *WR_OPTS], cwd=ROOT, check=True, capture_output=True)
        payload["showcase"] = {"record": rec, "text": SEP.join([*a["parts"][:-1], a["parts"][-1] + cta(a, thread)])}
        media = {"key": key, "mime": "video/mp4", "size": 0}
    # explicit user-agent: Cloudflare blocks the default Python-urllib one
    req = urllib.request.Request(f"{SITE}/__job", method="POST", data=json.dumps({"kind": "article", "ref": slug, "caption": caption, "media": media, "payload": payload}).encode(),
                                 headers={"authorization": f"Bearer {token}", "content-type": "application/json", "user-agent": "realufo-article/1"})
    try:  # the Worker sends the preview (maybe a video) to Telegram before it answers
        print("== waiting for your ✅ on Telegram: job", json.load(urllib.request.urlopen(req, timeout=300))["job"])
    except urllib.error.HTTPError as e:  # 4xx/5xx, e.g. 409 open job, 502 preview not delivered
        sys.exit(f"/__job {e.code}: {e.read().decode()[:300]}")
    except (urllib.error.URLError, TimeoutError) as e:
        sys.exit(f"/__job unreachable: {getattr(e, 'reason', e)} (check the deploy and Telegram for a preview before re-running)")


if __name__ == "__main__":
    main()
