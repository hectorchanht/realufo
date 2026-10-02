import ingest.fetch as fetch

class _Resp:
    status = 200

def test_head_ok_encodes_spaces_but_keeps_existing_escapes(monkeypatch):
    seen = []
    def urlopen(req, timeout):
        seen.append(req.full_url)
        return _Resp()
    monkeypatch.setattr(fetch.urllib.request, "urlopen", urlopen)
    assert fetch.head_ok("https://assets.realufo.org/pdfs/wargov/D135_ AAWSAP-May-18- 2010.pdf") is True
    assert fetch.head_ok("https://assets.realufo.org/pdfs/a%20b.pdf") is True
    assert seen == ["https://assets.realufo.org/pdfs/wargov/D135_%20AAWSAP-May-18-%202010.pdf",
                    "https://assets.realufo.org/pdfs/a%20b.pdf"]
