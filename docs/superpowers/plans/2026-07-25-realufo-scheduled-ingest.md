# RealUFO Scheduled Auto-Mirror Ingest — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A scheduled GitHub Action that crawls the four US official UAP sources, detects content not yet mirrored, copies files to R2, and upserts records into D1 — so realufo.org auto-stays-in-sync.

**Architecture:** A Python package `crawler/ingest/` runs in GitHub Actions. Per source it builds candidate records, diffs them against live D1 by R2 URL, downloads+uploads only new files to R2 (via `wrangler`), then upserts records/assets/archives into D1 (via `wrangler`, `INSERT OR IGNORE`). The Cloudflare Worker is untouched — it only serves.

**Tech Stack:** Python 3.11, `curl_cffi` (Akamai-bypass HTTP), `wrangler` CLI (R2 + D1), GitHub Actions (`schedule` + `workflow_dispatch`), pytest.

Spec: `docs/superpowers/specs/2026-07-25-realufo-scheduled-ingest-design.md`.

## Global Constraints

- Python **3.11+**; single runtime dep `curl_cffi` (`crawler/ingest/requirements.txt`).
- R2 base URL is exactly `https://assets.realufo.org`; bucket binding name `realufo`; D1 db `realufo-db`; account `f1868a071996e836eae6da2b65f37929`.
- `records.kind` ∈ `{pdf, image, video}` only (no `audio` — audio deferred). CSV `Type` maps `PDF→pdf`, `VID→video`, `IMG→image`; `AUD` and any other type are **skipped**.
- D1 writes are **`INSERT OR IGNORE`** on records; assets guarded by `NOT EXISTS(record_id, role)`; a record is emitted **only after** its file is confirmed in R2 (HEAD 200).
- Record id is deterministic: leading Title code (regex `^[A-Z0-9]{2,}(?:[-_][A-Z0-9]+){1,5}`) → else `<SLUG>-<file-stem>` → else `<SLUG>-<8hex of url>`; de-collided against existing D1 ids.
- Scope: sources `wargov, aaro, nasa, nara` only. License string `public-domain-usgov`. `status='live'`.
- All subprocess calls to `wrangler` pass `--remote`; the process env carries `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`.

---

### Task 1: Package scaffold, models, vendored source data

**Files:**
- Create: `crawler/ingest/__init__.py` (empty)
- Create: `crawler/ingest/models.py`
- Create: `crawler/ingest/requirements.txt`
- Create: `crawler/ingest/data/aaro.json`, `nasa.json`, `nara.json` (+ any `*-shard-*.json`) — copied from `/Users/laichan/code/tung/war-gov-ufo-release/data/`
- Test: `crawler/ingest/tests/__init__.py` (empty), `crawler/ingest/tests/test_models.py`

**Interfaces:**
- Produces: `Candidate` dataclass with fields `id, archive, agency, agency_full, title, summary, incident_date, location, doc_date, kind, redacted, virin, r2_key, cdn_url, mime, thumb_url`; module constants `R2_BASE="https://assets.realufo.org"`, `KIND_FROM_TYPE={"PDF":"pdf","VID":"video","IMG":"image"}`, `MIME={"pdf":"application/pdf","video":"video/mp4","image":"image/jpeg"}`.

- [ ] **Step 1: Copy vendored source snapshots**

```bash
mkdir -p crawler/ingest/data crawler/ingest/tests
cp /Users/laichan/code/tung/war-gov-ufo-release/data/aaro*.json crawler/ingest/data/
cp /Users/laichan/code/tung/war-gov-ufo-release/data/nasa*.json crawler/ingest/data/
cp /Users/laichan/code/tung/war-gov-ufo-release/data/nara*.json crawler/ingest/data/
touch crawler/ingest/__init__.py crawler/ingest/tests/__init__.py
printf 'curl_cffi>=0.7\n' > crawler/ingest/requirements.txt
```

- [ ] **Step 2: Write the failing test** — `crawler/ingest/tests/test_models.py`

```python
from ingest.models import Candidate, R2_BASE, KIND_FROM_TYPE, MIME

def test_candidate_defaults_and_kind_maps():
    c = Candidate(id="X", archive="aaro", agency="AARO", agency_full="AARO",
                  title="t", summary="s", incident_date="", location="",
                  doc_date="", kind="pdf", redacted=0, virin="",
                  r2_key="pdfs/aaro/x.pdf", cdn_url=f"{R2_BASE}/pdfs/aaro/x.pdf",
                  mime="application/pdf", thumb_url="")
    assert c.cdn_url.startswith("https://assets.realufo.org/")
    assert KIND_FROM_TYPE["VID"] == "video"
    assert MIME["video"] == "video/mp4"
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd crawler && python -m pytest ingest/tests/test_models.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'ingest.models'`

- [ ] **Step 4: Write `crawler/ingest/models.py`**

```python
from dataclasses import dataclass

R2_BASE = "https://assets.realufo.org"
KIND_FROM_TYPE = {"PDF": "pdf", "VID": "video", "IMG": "image"}
MIME = {"pdf": "application/pdf", "video": "video/mp4", "image": "image/jpeg"}

@dataclass
class Candidate:
    id: str
    archive: str
    agency: str
    agency_full: str
    title: str
    summary: str
    incident_date: str
    location: str
    doc_date: str
    kind: str            # pdf | image | video
    redacted: int
    virin: str
    r2_key: str          # e.g. "videos/wargov/DOD_123.mp4"
    cdn_url: str         # R2_BASE + "/" + r2_key
    mime: str
    thumb_url: str       # R2 thumb url or ""
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd crawler && python -m pytest ingest/tests/test_models.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add crawler/ingest/ && git commit -m "feat(ingest): package scaffold + Candidate model + vendored source data"
```

---

### Task 2: Pure mapping helpers (id, agency, dedup)

**Files:**
- Create: `crawler/ingest/mapping.py`
- Test: `crawler/ingest/tests/test_mapping.py`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `short_agency(ag: str, slug: str) -> str`
  - `derive_id(title: str, slug: str, url: str, taken: set[str]) -> str` — deterministic, never returns a value already in `taken`; mutates nothing.
  - `is_r2_hosted(url: str) -> bool` — True iff url starts with `R2_BASE + "/"`.

- [ ] **Step 1: Write the failing test** — `crawler/ingest/tests/test_mapping.py`

```python
from ingest.mapping import short_agency, derive_id, is_r2_hosted

def test_short_agency():
    assert short_agency("Department of War", "wargov") == "DoW"
    assert short_agency("AARO / DVIDS", "aaro") == "AARO"
    assert short_agency("", "nara") == "NARA"

def test_derive_id_prefers_title_code():
    assert derive_id("CIA-UAP-017, Foo", "wargov",
                     "https://assets.realufo.org/pdfs/wargov/x.pdf", set()) == "CIA-UAP-017"

def test_derive_id_falls_back_to_stem_then_hash_and_avoids_collisions():
    taken = {"CIA-UAP-017"}
    got = derive_id("CIA-UAP-017, Foo", "wargov",
                    "https://assets.realufo.org/pdfs/wargov/report-a.pdf", taken)
    assert got == "WARGOV-report-a"          # title code taken -> file stem
    taken.add("WARGOV-report-a")
    got2 = derive_id("no code here", "wargov",
                     "https://assets.realufo.org/pdfs/wargov/report-a.pdf", taken)
    assert got2.startswith("WARGOV-") and got2 not in taken   # stem taken -> hash

def test_is_r2_hosted():
    assert is_r2_hosted("https://assets.realufo.org/pdfs/aaro/x.pdf")
    assert not is_r2_hosted("https://www.aaro.mil/x.jpg")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd crawler && python -m pytest ingest/tests/test_mapping.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'ingest.mapping'`

- [ ] **Step 3: Write `crawler/ingest/mapping.py`**

```python
import posixpath, re, hashlib
from .models import R2_BASE

_AGENCY = {
    "CIA": "CIA", "FBI": "FBI", "NASA": "NASA", "AARO": "AARO", "NARA": "NARA",
    "Department of War": "DoW", "Department of Defense": "DoD", "Navy": "Navy",
}
_CODE = re.compile(r"^([A-Z0-9]{2,}(?:[-_][A-Z0-9]+){1,5})\b")

def short_agency(ag: str, slug: str) -> str:
    ag = (ag or "").split("/")[0].strip()
    return _AGENCY.get(ag, ag or slug.upper())

def is_r2_hosted(url: str) -> bool:
    return bool(url) and url.startswith(R2_BASE + "/")

def _stem(url: str) -> str:
    return posixpath.splitext(posixpath.basename(url.split("?")[0]))[0]

def derive_id(title: str, slug: str, url: str, taken: set) -> str:
    t = (title or "").strip().lstrip("\"'“” ")
    m = _CODE.match(t)
    cand = m.group(1).rstrip("-_,") if m else ""
    if cand and cand not in taken:
        return cand
    stem = f"{slug.upper()}-{_stem(url)}"[:64]
    if stem not in taken:
        return stem
    h = hashlib.sha256(url.encode()).hexdigest()[:8]
    return f"{slug.upper()}-{h}"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd crawler && python -m pytest ingest/tests/test_mapping.py -v`
Expected: PASS (4 passed)

- [ ] **Step 5: Commit**

```bash
git add crawler/ingest/mapping.py crawler/ingest/tests/test_mapping.py
git commit -m "feat(ingest): deterministic id/agency/dedup mapping helpers"
```

---

### Task 3: D1 SQL emission (pure) + wrangler wrappers

**Files:**
- Create: `crawler/ingest/d1.py`
- Test: `crawler/ingest/tests/test_d1.py`

**Interfaces:**
- Consumes: `Candidate` (Task 1).
- Produces:
  - `sql_q(v) -> str` — SQLite literal (NULL or single-quoted, apostrophes doubled).
  - `emit_sql(cands: list[Candidate], new_archives: dict[str,dict]) -> str` — full idempotent SQL (archives, records, assets).
  - `load_existing() -> tuple[set[str], set[str]]` — `(ids, r2_urls)` via `wrangler d1 execute --remote --json` (subprocess; not unit-tested).
  - `apply_sql(path: str) -> None` — `wrangler d1 execute realufo-db --remote --file <path>` (subprocess; not unit-tested).

- [ ] **Step 1: Write the failing test** — `crawler/ingest/tests/test_d1.py`

```python
from ingest.models import Candidate, R2_BASE
from ingest.d1 import sql_q, emit_sql

def _c(**kw):
    base = dict(id="AARO-X", archive="aaro", agency="AARO", agency_full="AARO",
                title="O'Brien Case", summary="s", incident_date="", location="",
                doc_date="", kind="image", redacted=0, virin="",
                r2_key="images/aaro/x.jpg", cdn_url=f"{R2_BASE}/images/aaro/x.jpg",
                mime="image/jpeg", thumb_url=f"{R2_BASE}/images/aaro/x.jpg")
    base.update(kw); return Candidate(**base)

def test_sql_q_escapes_apostrophes_and_null():
    assert sql_q("") == "NULL"
    assert sql_q("O'Brien") == "'O''Brien'"

def test_emit_sql_has_records_assets_and_new_archive():
    sql = emit_sql([_c()], {"aaro": {"label": "AARO", "flag": "🇺🇸", "accent": "#6ea8ff", "coord": "Pentagon"}})
    assert "INSERT OR IGNORE INTO archives" in sql
    assert "INSERT OR IGNORE INTO records" in sql and "'AARO-X'" in sql
    assert "INSERT INTO assets" in sql and "'full'" in sql and "'thumb'" in sql
    assert "O''Brien" in sql            # escaped

def test_emit_sql_no_thumb_when_absent():
    sql = emit_sql([_c(thumb_url="")], {})
    assert "'thumb'" not in sql and "'full'" in sql
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd crawler && python -m pytest ingest/tests/test_d1.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'ingest.d1'`

- [ ] **Step 3: Write `crawler/ingest/d1.py`**

```python
import json, subprocess

def sql_q(v) -> str:
    if v is None or v == "":
        return "NULL"
    return "'" + str(v).replace("'", "''") + "'"

def emit_sql(cands, new_archives) -> str:
    lines = []
    for slug, a in (new_archives or {}).items():
        lines.append(
            "INSERT OR IGNORE INTO archives(id,label,flag,accent,count,coord) VALUES("
            f"{sql_q(slug)},{sql_q(a.get('label'))},{sql_q(a.get('flag'))},"
            f"{sql_q(a.get('accent'))},0,{sql_q(a.get('coord'))});")
    for c in cands:
        lines.append(
            "INSERT OR IGNORE INTO records(id,archive,agency,agency_full,title,summary,"
            "incident_date,location,doc_date,kind,redacted,featured,virin,source_url,"
            "source_site,license,status) VALUES("
            f"{sql_q(c.id)},{sql_q(c.archive)},{sql_q(c.agency)},{sql_q(c.agency_full)},"
            f"{sql_q(c.title)},{sql_q(c.summary)},{sql_q(c.incident_date)},{sql_q(c.location)},"
            f"{sql_q(c.doc_date)},{sql_q(c.kind)},{int(c.redacted)},0,{sql_q(c.virin)},"
            f"{sql_q(c.cdn_url)},{sql_q(c.archive)},'public-domain-usgov','live');")
        lines.append(
            "INSERT INTO assets(record_id,role,cdn_url,mime) "
            f"SELECT {sql_q(c.id)},'full',{sql_q(c.cdn_url)},{sql_q(c.mime)} "
            f"WHERE NOT EXISTS(SELECT 1 FROM assets WHERE record_id={sql_q(c.id)} AND role='full');")
        if c.thumb_url:
            lines.append(
                "INSERT INTO assets(record_id,role,cdn_url,mime) "
                f"SELECT {sql_q(c.id)},'thumb',{sql_q(c.thumb_url)},'image/jpeg' "
                f"WHERE NOT EXISTS(SELECT 1 FROM assets WHERE record_id={sql_q(c.id)} AND role='thumb');")
    return "\n".join(lines) + "\n"

def _d1_json(cmd_sql: str):
    out = subprocess.run(
        ["wrangler", "d1", "execute", "realufo-db", "--remote", "--json", "--command", cmd_sql],
        capture_output=True, text=True, check=True).stdout
    start = out.index("[")
    return json.loads(out[start:])[0]["results"]

def load_existing():
    ids = {r["id"] for r in _d1_json("SELECT id FROM records")}
    urls = {r["cdn_url"] for r in _d1_json("SELECT DISTINCT cdn_url FROM assets WHERE cdn_url IS NOT NULL")}
    urls |= {r["source_url"] for r in _d1_json("SELECT source_url FROM records WHERE source_url IS NOT NULL")}
    return ids, urls

def apply_sql(path: str) -> None:
    subprocess.run(["wrangler", "d1", "execute", "realufo-db", "--remote", "--file", path], check=True)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd crawler && python -m pytest ingest/tests/test_d1.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add crawler/ingest/d1.py crawler/ingest/tests/test_d1.py
git commit -m "feat(ingest): idempotent D1 SQL emission + wrangler d1 wrappers"
```

---

### Task 4: Fetch (curl_cffi) + R2 mirror

**Files:**
- Create: `crawler/ingest/fetch.py`
- Create: `crawler/ingest/r2.py`
- Test: `crawler/ingest/tests/test_r2.py`

**Interfaces:**
- Consumes: `Candidate` (Task 1).
- Produces:
  - `fetch.download(url: str, dest: str) -> int` — curl_cffi Chrome-impersonation GET → write file → bytes. Raises on non-200.
  - `fetch.head_ok(url: str) -> bool` — HEAD, True iff 200 (plain urllib).
  - `r2.put(key: str, path: str, content_type: str) -> None` — `wrangler r2 object put realufo/<key> --file <path> --content-type <ct> --remote`.
  - `r2.mirror(c: Candidate, workdir: str) -> bool` — if `head_ok(cdn_url)` return True; else download from the ORIGIN url stored on the candidate's `_origin` attr, `put`, re-`head_ok`. Returns whether the file is confirmed in R2.

- [ ] **Step 1: Write the failing test** — `crawler/ingest/tests/test_r2.py` (pure decision path, network mocked)

```python
import ingest.r2 as r2
from ingest.models import Candidate, R2_BASE

def _c(origin):
    c = Candidate(id="X", archive="aaro", agency="AARO", agency_full="AARO", title="t",
                  summary="", incident_date="", location="", doc_date="", kind="image",
                  redacted=0, virin="", r2_key="images/aaro/x.jpg",
                  cdn_url=f"{R2_BASE}/images/aaro/x.jpg", mime="image/jpeg", thumb_url="")
    c._origin = origin
    return c

def test_mirror_skips_when_already_in_r2(monkeypatch):
    monkeypatch.setattr(r2.fetch, "head_ok", lambda u: True)
    calls = []
    monkeypatch.setattr(r2, "put", lambda *a, **k: calls.append(a))
    assert r2.mirror(_c("https://origin/x.jpg"), "/tmp") is True
    assert calls == []                       # no upload needed

def test_mirror_downloads_and_uploads_when_missing(monkeypatch):
    seen = {"head": 0}
    def head(u):
        seen["head"] += 1
        return seen["head"] > 1              # 404 first (pre), 200 after upload
    monkeypatch.setattr(r2.fetch, "head_ok", head)
    monkeypatch.setattr(r2.fetch, "download", lambda u, d: 10)
    puts = []
    monkeypatch.setattr(r2, "put", lambda k, p, ct: puts.append(k))
    assert r2.mirror(_c("https://origin/x.jpg"), "/tmp") is True
    assert puts == ["images/aaro/x.jpg"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd crawler && python -m pytest ingest/tests/test_r2.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'ingest.r2'`

- [ ] **Step 3: Write `crawler/ingest/fetch.py`**

```python
import urllib.request

def download(url: str, dest: str) -> int:
    from curl_cffi import requests
    r = requests.get(url, impersonate="chrome", timeout=60)
    r.raise_for_status()
    with open(dest, "wb") as f:
        f.write(r.content)
    return len(r.content)

def head_ok(url: str) -> bool:
    try:
        return urllib.request.urlopen(
            urllib.request.Request(url, method="HEAD"), timeout=20).status == 200
    except Exception:
        return False
```

- [ ] **Step 4: Write `crawler/ingest/r2.py`**

```python
import os, posixpath, subprocess
from . import fetch

def put(key: str, path: str, content_type: str) -> None:
    subprocess.run(
        ["wrangler", "r2", "object", "put", f"realufo/{key}",
         "--file", path, "--content-type", content_type, "--remote"],
        check=True)

def mirror(c, workdir: str) -> bool:
    if fetch.head_ok(c.cdn_url):
        return True
    origin = getattr(c, "_origin", "") or c.cdn_url
    tmp = os.path.join(workdir, posixpath.basename(c.r2_key))
    try:
        fetch.download(origin, tmp)
        put(c.r2_key, tmp, c.mime)
    except Exception:
        return False
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)
    return fetch.head_ok(c.cdn_url)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd crawler && python -m pytest ingest/tests/test_r2.py -v`
Expected: PASS (2 passed)

- [ ] **Step 6: Commit**

```bash
git add crawler/ingest/fetch.py crawler/ingest/r2.py crawler/ingest/tests/test_r2.py
git commit -m "feat(ingest): curl_cffi fetch + idempotent R2 mirror"
```

---

### Task 5: wargov source adapter (live CSV + DVIDS maps)

**Files:**
- Create: `crawler/ingest/sources/__init__.py`
- Create: `crawler/ingest/sources/wargov.py`
- Test: `crawler/ingest/tests/test_wargov.py`, `crawler/ingest/tests/fixtures/wargov_sample.csv`

**Interfaces:**
- Consumes: `Candidate`, `mapping.*`, `models.*`.
- Produces: `wargov.candidates(csv_paths: list[str], dvids_map: dict[str,str], taken: set[str]) -> list[Candidate]`. Each PDF/IMG/VID row → Candidate; `_origin` attr set to the war.gov source URL for mirroring; VID rows unresolved by `dvids_map` are skipped. `wargov.ARCHIVE_ROW` = dict for the archives table. Also `wargov.refresh_csvs(dest_dir: str, fallback_paths: list[str]) -> list[str]` — re-fetches the live war.gov CSVs (so new releases surface as new rows), falling back to committed copies; network wrapper, not unit-tested.

- [ ] **Step 1: Create fixture** — `crawler/ingest/tests/fixtures/wargov_sample.csv`

```csv
Featured,Redaction,Release Date,Title,Type,Video Pairing,PDF Pairing,Description Blurb,DVIDS Video ID,Video Title,Agency,Incident Date,Incident Location,PDF | Image Link,Modal Image,Image Alt Text,Image VIRIN
YES,,6/12/26,"CIA-UAP-017, Foo",PDF,,,Blurb one,,,CIA,"July, 2008","Harare",https://www.war.gov/medialink/ufo/061226/release_03/documents/CIA-UAP-017_Foo.pdf,https://www.war.gov/thumb/CIA-UAP-017_Foo.jpg,alt,V1
,,6/12/26,"FBI-UAP-PR003, Orbs",VID,,,Blurb two,1010267,,FBI,"October, 2024","NE US",,,,V2
,,6/12/26,"NASA Audio Clip",AUD,,,skip me,999,,NASA,,,,,,V3
```

- [ ] **Step 2: Write the failing test** — `crawler/ingest/tests/test_wargov.py`

```python
import os
from ingest.sources import wargov

FIX = os.path.join(os.path.dirname(__file__), "fixtures", "wargov_sample.csv")

def test_wargov_candidates_pdf_and_video_skip_aud_and_unresolved():
    cands = wargov.candidates([FIX], {"1010267": "111764159"}, set())
    ids = {c.id: c for c in cands}
    # PDF row -> pdf candidate with R2 pdf url + thumb, origin = war.gov link
    assert "CIA-UAP-017" in ids
    pdf = ids["CIA-UAP-017"]
    assert pdf.kind == "pdf"
    assert pdf.cdn_url == "https://assets.realufo.org/pdfs/wargov/CIA-UAP-017_Foo.pdf"
    assert pdf._origin.startswith("https://www.war.gov/")
    # VID row resolved via dvids map -> video candidate at DOD_<id>.mp4
    vid = ids["FBI-UAP-PR003"]
    assert vid.kind == "video"
    assert vid.cdn_url == "https://assets.realufo.org/videos/wargov/DOD_111764159.mp4"
    # AUD row skipped entirely
    assert all(c.kind != "audio" for c in cands)
    assert len(cands) == 2
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd crawler && python -m pytest ingest/tests/test_wargov.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'ingest.sources'`

- [ ] **Step 4: Write `crawler/ingest/sources/__init__.py`** (empty) and **`crawler/ingest/sources/wargov.py`**

```python
import csv, posixpath
from ..models import Candidate, R2_BASE, KIND_FROM_TYPE, MIME
from ..mapping import short_agency, derive_id

ARCHIVE_ROW = {"label": "War.gov · PURSUE", "flag": "🇺🇸", "accent": "#9184d9", "coord": "Washington, D.C."}

def _pdf_urls(link: str):
    base = posixpath.basename(link.split("?")[0])
    return (f"{R2_BASE}/pdfs/wargov/{base}",
            f"{R2_BASE}/pdf-thumbs/wargov/{posixpath.splitext(base)[0]}.jpg")

def candidates(csv_paths, dvids_map, taken):
    out, seen = [], set()
    for path in csv_paths:
        for r in csv.DictReader(open(path, encoding="utf-8-sig")):
            t = (r.get("Type") or "").strip()
            kind = KIND_FROM_TYPE.get(t)
            if not kind:
                continue                       # AUD / unknown -> skip
            title = (r.get("Title") or "").strip()
            link = (r.get("PDF | Image Link") or "").strip()
            if kind == "video":
                dod = dvids_map.get((r.get("DVIDS Video ID") or "").strip())
                if not dod:
                    continue                   # unresolved video -> skip
                cdn = f"{R2_BASE}/videos/wargov/DOD_{dod}.mp4"; thumb = ""; origin = cdn
            else:
                if not link:
                    continue
                if kind == "pdf":
                    cdn, thumb = _pdf_urls(link)
                else:
                    base = posixpath.basename(link.split("?")[0])
                    cdn = f"{R2_BASE}/images/wargov/{base}"; thumb = ""
                origin = link
            if cdn in seen:
                continue
            seen.add(cdn)
            rid = derive_id(title, "wargov", cdn, taken); taken.add(rid)
            c = Candidate(id=rid, archive="wargov", agency=short_agency(r.get("Agency"), "wargov"),
                          agency_full=(r.get("Agency") or "").strip(), title=title,
                          summary=(r.get("Description Blurb") or "").strip(),
                          incident_date=(r.get("Incident Date") or "").strip(),
                          location=(r.get("Incident Location") or "").strip(),
                          doc_date=(r.get("Release Date") or "").strip(), kind=kind,
                          redacted=1 if (r.get("Redaction") or "").strip() else 0,
                          virin=(r.get("Image VIRIN") or "").strip(), r2_key=cdn[len(R2_BASE) + 1:],
                          cdn_url=cdn, mime=MIME[kind], thumb_url=thumb)
            c._origin = origin
            out.append(c)
    return out


CSV_URLS = [
    ("https://www.war.gov/Portals/1/Interactive/2026/UFO/uap-data.csv", "uap-data.csv"),
    ("https://www.war.gov/Portals/1/Interactive/2026/UFO/uap-release001.csv", "uap-release001.csv"),
]

def refresh_csvs(dest_dir, fallback_paths):
    """Re-fetch the war.gov CSVs (curl_cffi) so brand-new releases surface as
    new rows. Falls back to the committed CSV for any URL that fails. Network
    wrapper — not unit-tested (like d1/r2 wrappers)."""
    import os, shutil
    from ..fetch import download
    out = []
    for url, name in CSV_URLS:
        dest = os.path.join(dest_dir, name)
        try:
            download(url, dest)
        except Exception:
            fb = next((p for p in fallback_paths if p.endswith(name)), None)
            if not (fb and os.path.exists(fb)):
                continue
            shutil.copy(fb, dest)
        out.append(dest)
    return out
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd crawler && python -m pytest ingest/tests/test_wargov.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add crawler/ingest/sources/ crawler/ingest/tests/test_wargov.py crawler/ingest/tests/fixtures/
git commit -m "feat(ingest): wargov adapter (CSV + DVIDS -> candidates)"
```

---

### Task 6: aaro / nasa / nara adapters (vendored snapshots)

**Files:**
- Create: `crawler/ingest/sources/snapshot.py`
- Test: `crawler/ingest/tests/test_snapshot.py`, `crawler/ingest/tests/fixtures/aaro_sample.json`

**Interfaces:**
- Consumes: `Candidate`, `mapping.*`, `models.*`.
- Produces: `snapshot.candidates(slug: str, data_dir: str, taken: set[str]) -> list[Candidate]` — reads `<data_dir>/<slug>.json` + `<slug>-shard-*.json`, keeps only `t∈{PDF,VID,IMG}` whose `u` is R2-hosted (`is_r2_hosted`), dedups by url; `_origin=u` (already R2, so mirror is a no-op HEAD). `snapshot.ARCHIVE_ROWS = {"nasa": {...}, "nara": {...}, "aaro": {...}}`.

- [ ] **Step 1: Create fixture** — `crawler/ingest/tests/fixtures/aaro_sample.json`

```json
{"v1": {"schemaVersion": 1, "slug": "aaro", "assets": [
  {"t": "PDF", "ti": "AARO Report A", "ag": "AARO", "de": "d", "date": "", "region": "",
   "u": "https://assets.realufo.org/pdfs/aaro/report-a.pdf", "th": "https://assets.realufo.org/pdf-thumbs/aaro/report-a.jpg"},
  {"t": "IMG", "ti": "Go Fast UAP", "ag": "AARO", "de": "", "date": "", "region": "",
   "u": "https://www.aaro.mil/x.jpg", "th": ""},
  {"t": "PDF", "ti": "AARO Report A", "ag": "AARO", "de": "d", "date": "", "region": "",
   "u": "https://assets.realufo.org/pdfs/aaro/report-a.pdf", "th": ""}
]}}
```

- [ ] **Step 2: Write the failing test** — `crawler/ingest/tests/test_snapshot.py`

```python
import os
from ingest.sources import snapshot

FIXDIR = os.path.join(os.path.dirname(__file__), "fixtures")

def test_snapshot_keeps_r2_hosted_dedups_and_skips_origin(tmp_path):
    import shutil
    shutil.copy(os.path.join(FIXDIR, "aaro_sample.json"), tmp_path / "aaro.json")
    cands = snapshot.candidates("aaro", str(tmp_path), set())
    assert len(cands) == 1                          # dup url collapsed, aaro.mil IMG dropped
    c = cands[0]
    assert c.kind == "pdf"
    assert c.cdn_url == "https://assets.realufo.org/pdfs/aaro/report-a.pdf"
    assert c.thumb_url.endswith("report-a.jpg")
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd crawler && python -m pytest ingest/tests/test_snapshot.py -v`
Expected: FAIL — `ImportError: cannot import name 'snapshot'`

- [ ] **Step 4: Write `crawler/ingest/sources/snapshot.py`**

```python
import glob, json, os
from ..models import Candidate, R2_BASE, KIND_FROM_TYPE, MIME
from ..mapping import short_agency, derive_id, is_r2_hosted

ARCHIVE_ROWS = {
    "aaro": {"label": "AARO", "flag": "🇺🇸", "accent": "#6ea8ff", "coord": "Pentagon"},
    "nasa": {"label": "NASA", "flag": "🇺🇸", "accent": "#46dfff", "coord": "NASA HQ"},
    "nara": {"label": "NARA", "flag": "🇺🇸", "accent": "#4df0a6", "coord": "National Archives"},
}

def _load(slug, data_dir):
    assets = []
    files = [os.path.join(data_dir, f"{slug}.json")] + sorted(glob.glob(os.path.join(data_dir, f"{slug}-shard-*.json")))
    for f in files:
        if os.path.exists(f):
            assets += json.load(open(f))["v1"].get("assets", [])
    return assets

def candidates(slug, data_dir, taken):
    out, seen = [], set()
    for a in _load(slug, data_dir):
        kind = KIND_FROM_TYPE.get((a.get("t") or "").strip())
        u = (a.get("u") or a.get("l") or "").strip()
        if not kind or not is_r2_hosted(u) or u in seen:
            continue
        seen.add(u)
        th = (a.get("th") or "").strip()
        rid = derive_id((a.get("ti") or "").strip(), slug, u, taken); taken.add(rid)
        c = Candidate(id=rid, archive=slug, agency=short_agency(a.get("ag"), slug),
                      agency_full=(a.get("ag") or "").strip(), title=(a.get("ti") or "").strip(),
                      summary=(a.get("de") or "").strip(), incident_date=(a.get("date") or "").strip(),
                      location=(a.get("region") or "").strip(), doc_date=(a.get("date") or "").strip(),
                      kind=kind, redacted=0, virin="", r2_key=u[len(R2_BASE) + 1:], cdn_url=u,
                      mime=MIME[kind], thumb_url=th if is_r2_hosted(th) else "")
        c._origin = u
        out.append(c)
    return out
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd crawler && python -m pytest ingest/tests/test_snapshot.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add crawler/ingest/sources/snapshot.py crawler/ingest/tests/test_snapshot.py crawler/ingest/tests/fixtures/aaro_sample.json
git commit -m "feat(ingest): aaro/nasa/nara snapshot adapters"
```

---

### Task 7: CLI orchestration + dry-run

**Files:**
- Create: `crawler/ingest/cli.py`
- Create: `crawler/ingest/__main__.py`
- Test: `crawler/ingest/tests/test_cli.py`

**Interfaces:**
- Consumes: all prior modules.
- Produces:
  - `cli.build_plan(existing_ids, existing_urls, all_candidates) -> list[Candidate]` — pure filter: keep candidates whose `cdn_url` ∉ existing_urls.
  - `cli.run(sources, dry_run, limit) -> dict` — orchestrates load→diff→mirror→emit→apply; returns a summary dict `{slug: {"new": n, "mirrored": n, "failed": n}}`.
  - `cli.main(argv=None)` — argparse (`--sources`, `--dry-run`, `--limit`), prints the summary, exits non-zero if any source failed to apply.

- [ ] **Step 1: Write the failing test** — `crawler/ingest/tests/test_cli.py`

```python
from ingest import cli
from ingest.models import Candidate, R2_BASE

def _c(cid, url):
    return Candidate(id=cid, archive="wargov", agency="CIA", agency_full="CIA", title="t",
                     summary="", incident_date="", location="", doc_date="", kind="pdf",
                     redacted=0, virin="", r2_key=url[len(R2_BASE) + 1:], cdn_url=url,
                     mime="application/pdf", thumb_url="")

def test_build_plan_keeps_only_unregistered_urls():
    a = _c("A", f"{R2_BASE}/pdfs/wargov/a.pdf")
    b = _c("B", f"{R2_BASE}/pdfs/wargov/b.pdf")
    plan = cli.build_plan({"A"}, {a.cdn_url}, [a, b])
    assert [c.id for c in plan] == ["B"]      # a already registered by url
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd crawler && python -m pytest ingest/tests/test_cli.py -v`
Expected: FAIL — `ImportError: cannot import name 'cli'`

- [ ] **Step 3: Write `crawler/ingest/cli.py`**

```python
import argparse, os, sys, tempfile
from . import d1, r2
from .sources import wargov, snapshot

HERE = os.path.dirname(__file__)
DATA = os.path.join(HERE, "data")
CSV_PATHS = [os.path.join(os.path.dirname(HERE), "uap-data.csv"),
             os.path.join(os.path.dirname(HERE), "uap-release001.csv")]
DVIDS_DIR = os.path.join(os.path.dirname(HERE), "dvids-maps")

def _dvids_map():
    import glob, json
    m = {}
    for p in sorted(glob.glob(os.path.join(DVIDS_DIR, "dvids2dod-r0*.json"))):
        m.update(json.load(open(p)))
    return m

def _load_source(slug, taken, work):
    if slug == "wargov":
        # re-fetch live war.gov CSVs so new releases surface as new rows
        paths = wargov.refresh_csvs(work, CSV_PATHS) or CSV_PATHS
        return wargov.candidates(paths, _dvids_map(), taken), wargov.ARCHIVE_ROW
    return snapshot.candidates(slug, DATA, taken), snapshot.ARCHIVE_ROWS[slug]

def build_plan(existing_ids, existing_urls, all_candidates):
    return [c for c in all_candidates if c.cdn_url not in existing_urls]

def run(sources, dry_run=False, limit=None):
    existing_ids, existing_urls = d1.load_existing()
    taken = set(existing_ids)
    summary = {}
    with tempfile.TemporaryDirectory() as work:
        for slug in sources:
            cands, arch_row = _load_source(slug, taken, work)
            plan = build_plan(existing_ids, existing_urls, cands)
            if limit:
                plan = plan[:limit]
            mirrored, failed = [], 0
            for c in plan:
                if dry_run:
                    mirrored.append(c); continue
                if r2.mirror(c, work):
                    mirrored.append(c); existing_urls.add(c.cdn_url)
                else:
                    failed += 1
            summary[slug] = {"new": len(plan), "mirrored": len(mirrored), "failed": failed}
            if mirrored and not dry_run:
                sql = d1.emit_sql(mirrored, {slug: arch_row})
                p = os.path.join(work, f"{slug}.sql")
                open(p, "w").write(sql)
                d1.apply_sql(p)
    return summary

def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--sources", default="wargov,aaro,nasa,nara")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=None)
    args = ap.parse_args(argv)
    summary = run([s.strip() for s in args.sources.split(",") if s.strip()], args.dry_run, args.limit)
    for slug, s in summary.items():
        print(f"{slug:8} new={s['new']:4} mirrored={s['mirrored']:4} failed={s['failed']:4}")
    sys.exit(1 if any(s["failed"] for s in summary.values()) else 0)
```

- [ ] **Step 4: Write `crawler/ingest/__main__.py`**

```python
from .cli import main
main()
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd crawler && python -m pytest ingest/tests/ -v`
Expected: PASS (all tasks' tests green)

- [ ] **Step 6: Dry-run smoke against live D1 (read-only)**

Run: `cd crawler && CLOUDFLARE_API_TOKEN=$TOK CLOUDFLARE_ACCOUNT_ID=f1868a071996e836eae6da2b65f37929 python -m ingest --dry-run`
Expected: prints a per-source table; `new=0` for already-mirrored content, no writes.

- [ ] **Step 7: Commit**

```bash
git add crawler/ingest/cli.py crawler/ingest/__main__.py crawler/ingest/tests/test_cli.py
git commit -m "feat(ingest): CLI orchestration + dry-run"
```

---

### Task 8: GitHub Actions schedule + runbook

**Files:**
- Create: `.github/workflows/ingest.yml`
- Create: `crawler/ingest/README.md`

**Interfaces:**
- Consumes: `python -m ingest` (Task 7); repo secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

- [ ] **Step 1: Write `.github/workflows/ingest.yml`**

```yaml
name: ingest
on:
  schedule:
    - cron: "0 6 * * *"        # daily 06:00 UTC
  workflow_dispatch:
    inputs:
      dry_run: { description: "dry run (no writes)", type: boolean, default: true }
      sources: { description: "comma sources", default: "wargov,aaro,nasa,nara" }
jobs:
  ingest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.11" }
      - uses: actions/setup-node@v4
        with: { node-version: "20" }
      - run: pip install -r crawler/ingest/requirements.txt pytest
      - run: cd crawler && python -m pytest ingest/tests/ -q
      - run: npm i -g wrangler
      - name: ingest
        working-directory: crawler
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
        run: |
          python -m ingest \
            --sources "${{ github.event.inputs.sources || 'wargov,aaro,nasa,nara' }}" \
            ${{ (github.event_name == 'workflow_dispatch' && github.event.inputs.dry_run == 'false') && ' ' || '--dry-run' }}
```

Note: scheduled runs default to `--dry-run` via the ternary (schedule has no inputs → falls to `--dry-run`). To enable real scheduled writes, change the final line to always run without `--dry-run` after the first manual verification (Step 3).

- [ ] **Step 2: Write `crawler/ingest/README.md`** (runbook)

```markdown
# ingest — scheduled US UAP auto-mirror

Runs in GitHub Actions. Crawls wargov/aaro/nasa/nara, mirrors new files to R2,
upserts D1. Idempotent: re-runs only add what's new.

## Secrets (repo Settings → Actions)
- CLOUDFLARE_API_TOKEN — custom token: Account · Workers R2 Storage · Edit +
  Account · D1 · Edit, scoped to account f1868a071996e836eae6da2b65f37929
- CLOUDFLARE_ACCOUNT_ID — f1868a071996e836eae6da2b65f37929

## Run locally (dry)
    cd crawler && pip install -r ingest/requirements.txt
    CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... python -m ingest --dry-run

## First live run
1. Actions → ingest → Run workflow → dry_run=false, sources=nara (small).
2. Verify: curl https://realufo.org/api/records?archive=nara
3. When happy, flip the workflow's scheduled run to real (remove the --dry-run
   default in ingest.yml) and let the daily cron take over.
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ingest.yml crawler/ingest/README.md
git commit -m "feat(ingest): daily GitHub Actions schedule + runbook"
```

---

## Self-Review

**Spec coverage:**
- §3 architecture (GH Action → R2 → D1, Worker untouched) → Tasks 4,7,8. ✓
- §4.1 adapters (wargov live CSV; aaro/nasa/nara) → Tasks 5,6. ✓
- §4.2 diff by R2 URL → Task 7 `build_plan` + Task 3 `load_existing`. ✓
- §4.3 mirror with HEAD gate → Task 4 `r2.mirror`. ✓
- §4.4 upsert archives+records+assets, INSERT OR IGNORE → Task 3 `emit_sql`. ✓
- §4.5 workflow (schedule + dispatch, secrets) → Task 8. ✓
- §5 idempotency (deterministic id, url dedup) → Tasks 2,7. ✓
- §6 failure handling (per-item, non-fatal, summary) → Task 7 `run`. ✓
- §7 testing (unit + dry-run + first manual run) → Tasks 2–7 tests, Task 7 Step 6, Task 8 README. ✓
- §8 human actions (token, secrets) → Task 8 README + workflow. ✓
- §9 out-of-scope (audio via KIND_FROM_TYPE skip; non-US not in source registry) → Task 1/5. ✓

**Placeholder scan:** none — every code step is complete.

**Type consistency:** `Candidate` fields, `candidates()` signatures, `emit_sql`/`load_existing`/`build_plan`/`mirror` names are consistent across Tasks 1–8. `_origin` attr set by adapters (Tasks 5,6), read by `r2.mirror` (Task 4). ✓
