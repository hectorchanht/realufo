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
