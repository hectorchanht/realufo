"""DVIDS video-page parsing for AARO metadata (used by crawler/aaro-dvids.py).

A DVIDS page (www.dvidshub.net/video/<id>) carries the official title
(og:title), the full description, and a VIDEO INFO block with Date Taken,
VIRIN and Filename (DOD_<asset id>) -- the asset id is how a page maps to
our videos/aaro/DOD_<id>.mp4 records.
"""
import html, re
from . import d1

BAD_TITLE = "NAVAIR - FOIA: Unresolved Case: GIMBAL Video"


def _text(page):
    t = re.sub(r"<(script|style)\b.*?</\1>", " ", page, flags=re.S | re.I)
    t = re.sub(r"<br\s*/?>|</p>|</div>", "\n", t, flags=re.I)
    t = html.unescape(re.sub(r"<[^>]+>", " ", t))
    return "\n".join(" ".join(l.split()) for l in t.splitlines() if l.strip())


def parse_page(page):
    og = lambda p: (m := re.search(rf'<meta property="og:{p}" content="([^"]*)"', page)) and html.unescape(m.group(1)).strip()
    text = _text(page)
    info = text.split("VIDEO INFO", 1)
    desc = ""
    lead = (og("description") or "")[:40]
    if lead and lead in info[0]:
        desc = info[0][info[0].rindex(lead):].strip()  # last occurrence = the page body, not the header teaser
    after = info[1] if len(info) > 1 else text
    field = lambda name, pat: (m := re.search(rf"{name}:\s*({pat})", after)) and m.group(1)
    taken = field("Date Taken", r"\d\d\.\d\d\.\d{4}")
    dod = field("Filename", r"DOD_\d+")
    return {
        "title": og("title") or "",
        "description": desc,
        "year": taken[-4:] if taken else None,
        "virin": field("VIRIN", r"[\w-]+"),
        "dod": dod[4:] if dod else None,
    }


def location_from_title(title):
    """'PR-004, … , Europe 2022' / 'Unresolved UAP Report: Middle East 2024' -> region."""
    m = re.search(r"[,:]\s*([A-Z][^,:]*?)\s+(19|20)\d\d$", title.strip())
    return m.group(1) if m else None


def update_sql(record_id, meta):
    loc = location_from_title(meta["title"])
    # DVIDS "Date Taken" is sometimes the hearing/posting date ("Navy 2021 Flyby video" -> 05.17.2022)
    named = re.search(r"\b(19|20)\d\d\b", meta["title"])
    year = named.group(0) if named else meta["year"]
    return (f"UPDATE records SET title={d1.sql_q(meta['title'])}, summary={d1.sql_q(meta['description'])}, "
            f"virin={d1.sql_q(meta['virin'])}, incident_date={d1.sql_q(year)}, "
            f"location=COALESCE({d1.sql_q(loc)},location) WHERE id={d1.sql_q(record_id)};")


def neutral_sql(record_id, dod):
    """For an AARO clip whose DVIDS page can't be found: replace the wrong GIMBAL title with an honest one."""
    return (f"UPDATE records SET title={d1.sql_q(f'AARO video · DOD_{dod} (original title not published)')}, "
            f"summary=NULL WHERE id={d1.sql_q(record_id)} AND title LIKE {d1.sql_q(BAD_TITLE + '%')};")
