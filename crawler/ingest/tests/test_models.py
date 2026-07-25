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
