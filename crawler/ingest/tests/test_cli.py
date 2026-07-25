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
