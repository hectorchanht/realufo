"""Share PNG per TL;DR (Spec 7 §3): 1200x630, thumb left, one-liner + bullets right.

    python3 -m ingest.cards --dry-run --limit 3 --out /tmp/cards   # render locally, no upload
    python3 -m ingest.cards [--limit N] [--ids ...]

Rows with card_url NULL (new, or cleared by ingest.tldr on regeneration). The
key carries the input hash, so a regenerated card gets a new URL and the
1-month CDN cache never serves a stale one. An unreachable thumb -> text-only card.
"""
import argparse, io, json, os, sys, tempfile, urllib.parse, urllib.request
from PIL import Image, ImageDraw, ImageFont
from . import d1, r2
from .models import R2_BASE
from .textindex import flush

W, H = 1200, 630
BG, INK, DIM, SIGNAL = (7, 8, 12), (231, 236, 244), (139, 150, 169), (77, 240, 166)  # web/src/theme/theme.css dark
FONTS = os.path.join(os.path.dirname(__file__), "data", "fonts")
SANS, MONO = "space-grotesk", "jetbrains-mono"  # family prefixes of the vendored @fontsource files
UA = {"User-Agent": "realufo-ingest/1.0 (+https://realufo.org)"}
SELECT = """SELECT x.record_id id, x.bullets, x.one_liner, x.input_hash,
  (SELECT cdn_url FROM assets a WHERE a.record_id=r.id AND (a.role='thumb' OR (a.role='full' AND a.mime LIKE 'image/%'))
   ORDER BY a.role='thumb' DESC LIMIT 1) thumb
FROM record_tldr x JOIN records r ON r.id=x.record_id
WHERE x.lang='en' AND x.card_url IS NULL AND r.status='live'{ids} ORDER BY x.record_id{limit}"""

def font(family: str, size: int, weight: int = 400):
    # weights vendored: SANS 400/700, MONO 500/600
    return ImageFont.truetype(os.path.join(FONTS, f"{family}-latin-{weight}-normal.woff"), size)

def wrap(d, text: str, f, width: int) -> list[str]:
    lines, cur = [], ""
    for word in text.split():
        while d.textlength(word, font=f) > width:  # unbroken token: hard-break by characters
            cut = len(word)
            while cut > 1 and d.textlength(word[:cut], font=f) > width:
                cut -= 1
            if cur:
                lines.append(cur)
                cur = ""
            lines.append(word[:cut])
            word = word[cut:]
        trial = f"{cur} {word}".strip()
        if d.textlength(trial, font=f) <= width:
            cur = trial
        else:
            lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines

def clip_lines(d, lines: list[str], f, width: int, max_lines: int) -> list[str]:
    if len(lines) <= max_lines:
        return lines
    lines = lines[:max_lines]
    while lines[-1] and d.textlength(lines[-1] + "…", font=f) > width:
        lines[-1] = lines[-1][:-1]
    lines[-1] = lines[-1].rstrip() + "…"
    return lines

def fit(d, text: str, width: int, max_lines: int = 3, sizes=(52, 46, 40, 36, 32)):
    for s in sizes:
        f = font(SANS, s, 700)
        lines = wrap(d, text, f, width)
        if len(lines) <= max_lines:
            return f, lines
    return f, clip_lines(d, lines, f, width, max_lines)

def cover(img, w: int, h: int):
    s = max(w / img.width, h / img.height)
    img = img.resize((max(w, round(img.width * s)), max(h, round(img.height * s))))
    x, y = (img.width - w) // 2, (img.height - h) // 2
    return img.crop((x, y, x + w, y + h))

def one_line(d, text: str, f, width: int) -> str:
    return clip_lines(d, wrap(d, text, f, width), f, width, 1)[0]

def layout(d, rid: str, has_thumb: bool) -> dict:
    """Column + id strings, clipped so long AARO ids never run off the card or under "TL;DR"."""
    x0, width = (568, W - 568 - 56) if has_thumb else (64, W - 128)
    kf, mf = font(MONO, 24, 600), font(MONO, 20, 500)
    tldr_x = W - 56 - d.textlength("TL;DR", font=mf)
    return {"x0": x0, "width": width, "kf": kf, "mf": mf, "tldr_x": tldr_x, "footer_x": x0,
            "kicker": one_line(d, rid, kf, width),
            "footer": one_line(d, f"realufo.org/doc/{rid}", mf, int(tldr_x - 24 - x0))}

def render(t: dict, rid: str, thumb) -> Image.Image:
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    if thumb is not None:
        img.paste(cover(thumb.convert("RGB"), 520, H), (0, 0))
    L = layout(d, rid, thumb is not None)
    x0, width = L["x0"], L["width"]
    y = 52
    d.text((x0, y), L["kicker"], font=L["kf"], fill=SIGNAL)
    y += 48
    f, lines = fit(d, f"“{t['one_liner']}”", width)
    for line in lines:
        d.text((x0, y), line, font=f, fill=INK)
        y += round(f.size * 1.18)
    y += 16
    bf = font(SANS, 22, 400)
    for b in t["bullets"]:
        for j, line in enumerate(clip_lines(d, wrap(d, b, bf, width - 28), bf, width - 28, 3)):
            if j == 0:
                d.text((x0, y), "•", font=bf, fill=SIGNAL)
            d.text((x0 + 28, y), line, font=bf, fill=DIM)
            y += 28
        y += 4
    d.text((L["footer_x"], H - 56), L["footer"], font=L["mf"], fill=DIM)
    d.text((L["tldr_x"], H - 56), "TL;DR", font=L["mf"], fill=SIGNAL)
    return img

def fetch_thumb(url):
    """None only when the record has no thumb; a fetch failure raises so no card is made (retried next run)."""
    if not url:
        return None
    # R2 keys can contain raw spaces (same escaping as fetch.head_ok)
    req = urllib.request.Request(urllib.parse.quote(url, safe=":/?#[]@!$&'()*+,;=%~"), headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return Image.open(io.BytesIO(r.read())).convert("RGB")

def card_key(rid: str, h: str) -> str:
    return f"cards/{rid}-en-{h[:8]}.png"

def card_url(key: str) -> str:
    return f"{R2_BASE}/{urllib.parse.quote(key)}"

def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="render only; no upload, no D1 writes")
    ap.add_argument("--out", default=None, help="with --dry-run: save PNGs here to look at")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--ids", nargs="*", default=None)
    args = ap.parse_args(argv)
    sql = SELECT.format(ids=f" AND x.record_id IN ({','.join(d1.sql_q(i) for i in args.ids)})" if args.ids else "",
                        limit=f" LIMIT {int(args.limit)}" if args.limit else "")
    rows = d1._d1_json(" ".join(sql.split()))
    pending, ok, failed = [], 0, 0
    with tempfile.TemporaryDirectory() as work:
        for i, row in enumerate(rows, 1):
            key = card_key(row["id"], row["input_hash"])
            try:
                try:
                    thumb = fetch_thumb(row.get("thumb"))
                except Exception as e:
                    raise RuntimeError(f"thumb fetch failed: {e}") from e
                img = render({"bullets": json.loads(row["bullets"]), "one_liner": row["one_liner"]}, row["id"], thumb)
                path = os.path.join(args.out if args.dry_run and args.out else work, os.path.basename(key))
                os.makedirs(os.path.dirname(path), exist_ok=True)
                img.save(path, "PNG", optimize=True)
                if not args.dry_run:
                    r2.put(key, path, "image/png")
            except Exception as e:
                failed += 1
                print(f"[{i}/{len(rows)}] FAIL {row['id']}: {e}")
                continue
            ok += 1
            print(f"[{i}/{len(rows)}] ok   {row['id']} -> {key}")
            pending.append(f"UPDATE record_tldr SET card_url={d1.sql_q(card_url(key))} "
                           f"WHERE record_id={d1.sql_q(row['id'])} AND lang='en' AND input_hash={d1.sql_q(row['input_hash'])};")
            if not args.dry_run and len(pending) >= 25:
                flush(pending, work)
                pending = []
        if not args.dry_run and pending:
            flush(pending, work)
    print(f"{'dry-run ' if args.dry_run else ''}cards ok={ok} failed={failed}")
    sys.exit(1 if failed else 0)

if __name__ == "__main__":
    main()
