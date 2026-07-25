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
