#!/usr/bin/env python3
"""Publish an article (publish-article skill): showcase/articles/<slug>/article.json.

  python3 scripts/article.py SLUG            images → R2, rows → D1 (articles, article_records),
                                              site thread (OP = story, one reply per evidence)
  python3 scripts/article.py SLUG --social   …then post the Short + story as an X thread and
                                              mirror it to every enabled platform (publish.sh)

Idempotent: image keys are uuid5(slug/file), rows are upserts, the site thread is made once
(articles.thread_id), and publish.sh posts a showcase once per record.

article.json: slug, title, hero (image), short (mp4, for --social), showcase_record (the record
the X post hangs off), parts (the story; X thread tweets, each ≤280), evidence: [{id, t?, label,
evidence, image?}].
"""
import json, os, re, subprocess, sys, tempfile, uuid
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
    d = json.loads(re.search(r"^[\[{].*", out.stdout, re.S | re.M)[0])  # --file prints upload progress first
    return (d[0] if isinstance(d, list) else d).get("results", [])


def upload(slug, name):
    if not name:
        return None
    key = f"uploads/{uuid.uuid5(uuid.NAMESPACE_URL, f'realufo-article/{slug}/{name}')}.jpg"
    subprocess.run([*WR, "r2", "object", "put", f"realufo/{key}", "--file", os.path.join(ROOT, "showcase/articles", slug, name),
                    "--content-type", "image/jpeg", "--cache-control", "public, max-age=2592000", *WR_OPTS],
                   cwd=ROOT, check=True, capture_output=True)
    return key


def doc_link(e):
    t = e.get("t")
    return f"{SITE}/doc/{e['id']}" + (f"?t={t:g}" if t is not None else "")


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    slug, social = sys.argv[1], "--social" in sys.argv[2:]
    a = json.load(open(os.path.join(ROOT, "showcase/articles", slug, "article.json")))
    assert a["slug"] == slug and a["parts"] and a["evidence"], "article.json: slug/parts/evidence"
    ids = [e["id"] for e in a["evidence"]]
    found = {r["id"] for r in d1(f"SELECT id FROM records WHERE status='live' AND id IN ({','.join(map(q, ids))})", read=True)}
    if missing := [i for i in ids if i not in found]:
        sys.exit(f"not live records: {missing}")

    print(f"== images → R2 ({slug})")
    hero = upload(slug, a.get("hero"))
    imgs = {e["id"]: upload(slug, e.get("image")) for e in a["evidence"]}

    print("== rows → D1")
    sql = [f"""INSERT INTO articles(slug,title,body,image_key) VALUES({q(slug)},{q(a['title'])},{q(SEP.join(a['parts']))},{q(hero)})
               ON CONFLICT(slug) DO UPDATE SET title=excluded.title, body=excluded.body, image_key=excluded.image_key;""",
           f"DELETE FROM article_records WHERE slug={q(slug)};"]  # the article's own evidence list, rewritten as a whole
    sql += [f"INSERT INTO article_records(slug,record_id,pos,t,label,evidence,image_key) VALUES({q(slug)},{q(e['id'])},{i},{q(e.get('t'))},{q(e['label'])},{q(e['evidence'])},{q(imgs[e['id']])});"
            for i, e in enumerate(a["evidence"])]
    d1("\n".join(sql))

    # Site thread, Reddit-style: OP = the story (thread numbering dropped) + hero; one reply per piece of
    # evidence, its doc link (with ?t=) embeds the record at that moment. Made once, text refreshed on re-runs.
    thread = f"ar_{slug}"
    op = "\n\n".join(re.sub(r"^\d+/\s*", "", p) for p in a["parts"])
    replies = [(f"{thread}_{i}", f"{e['label']}\n\n{e['evidence']}\n\n{doc_link(e)}", imgs[e["id"]]) for i, e in enumerate(a["evidence"], 1)]
    if d1(f"SELECT thread_id FROM articles WHERE slug={q(slug)}", read=True)[0]["thread_id"]:
        print("== site thread (refresh text)")
        rows = [f"UPDATE threads SET title={q(a['title'][:120])}, op_body={q(op)} WHERE id={q(thread)};",
                f"UPDATE posts SET body={q(op)} WHERE id={q(thread + '_op')};"]
        rows += [f"UPDATE posts SET body={q(b)} WHERE id={q(pid)};" for pid, b, _ in replies]
    else:
        print("== site thread")
        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        no = int(datetime.now().timestamp()) % 9000 + 24419000
        src = a.get("showcase_record") or ids[0]
        rows = [f"""INSERT INTO threads(id,no,board_id,title,stance,op_body,op_handle,op_id,tags,votes,reply_count,img_count,source_record_id,hot,created_at)
                    VALUES({q(thread)},{no},'uap',{q(a['title'][:120])},'analyst',{q(op)},'RealUFO',{q(thread + '_op')},'[]',0,{len(ids)},{len([k for k in [hero, *imgs.values()] if k])},{q(src)},0,{q(now)});""",
                f"""INSERT INTO posts(id,no,thread_id,body,handle,stance,votes,source_record_id,image_r2_key,image_kind,is_op,created_at)
                    VALUES({q(thread + '_op')},{no},{q(thread)},{q(op)},'RealUFO','analyst',0,{q(src)},{q(hero)},{q(hero and 'upload')},1,{q(now)});"""]
        rows += [f"""INSERT INTO posts(id,no,thread_id,body,handle,stance,votes,image_r2_key,image_kind,is_op,created_at)
                    VALUES({q(pid)},{no + i},{q(thread)},{q(b)},'RealUFO','analyst',0,{q(img)},{q(img and 'upload')},0,{q(now)});"""
                 for i, (pid, b, img) in enumerate(replies, 1)]
        rows.append(f"UPDATE articles SET thread_id={q(thread)} WHERE slug={q(slug)};")
    d1("\n".join(rows))
    print(f"   {SITE}/thread/{thread}")

    urls = [f"{SITE}/thread/{thread}", *[f"{SITE}/doc/{i}" for i in ids]]
    subprocess.run([sys.executable, "crawler/indexnow.py", *urls], cwd=ROOT)

    if social:
        short = os.path.join(ROOT, "showcase/articles", slug, a["short"])
        text = SEP.join([*a["parts"][:-1], a["parts"][-1] + f"\nFull story: {SITE}/thread/{thread}"])
        subprocess.run(["scripts/publish.sh", "--showcase", a["showcase_record"], short, text], cwd=ROOT, check=True)


if __name__ == "__main__":
    main()
