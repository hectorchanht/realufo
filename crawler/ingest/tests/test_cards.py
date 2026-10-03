import io
import pytest
from PIL import Image, ImageDraw
from ingest import cards

T = {"bullets": ["Navy pilots in two F/A-18 jets film an object off San Diego",
                 "They watch it for 5 minutes at 2000 feet",
                 "No official conclusion in the file"],
     "one_liner": "The paperwork took longer than the encounter."}

def test_render_size_with_and_without_thumb():
    thumb = Image.new("RGB", (640, 360), (200, 0, 0))
    for th in (thumb, None):
        img = cards.render(T, "DOW-UAP-D084", th)
        assert img.size == (1200, 630) and img.mode == "RGB"

def test_render_png_bytes():
    buf = io.BytesIO()
    cards.render(T, "X-1", None).save(buf, "PNG")
    assert buf.getvalue()[:8] == b"\x89PNG\r\n\x1a\n"

def test_wrap_never_exceeds_width_even_with_unbroken_token():
    d = ImageDraw.Draw(Image.new("RGB", (10, 10)))
    f = cards.font(cards.SANS, 40, 700)
    text = "Look " + "A" * 80 + " at this very long sentence that must wrap"
    lines = cards.wrap(d, text, f, 500)
    assert len(lines) > 1 and all(d.textlength(l, font=f) <= 500 for l in lines)

def test_fit_caps_lines_with_ellipsis():
    d = ImageDraw.Draw(Image.new("RGB", (10, 10)))
    f, lines = cards.fit(d, " ".join(["paperwork"] * 60), 300, max_lines=3)
    assert len(lines) == 3 and lines[-1].endswith("…")

def test_fetch_thumb_none_for_missing_url_but_raises_on_fetch_error():
    assert cards.fetch_thumb(None) is None and cards.fetch_thumb("") is None
    with pytest.raises(Exception):  # a transient error must not become a permanent text-only card
        cards.fetch_thumb("http://127.0.0.1:9/nope.jpg")

def test_fetch_thumb_encodes_spaces_in_url(monkeypatch):
    buf = io.BytesIO()
    Image.new("RGB", (2, 2)).save(buf, "PNG")
    seen = []
    class Resp(io.BytesIO):
        def __enter__(self): return self
        def __exit__(self, *a): return False
    def fake(req, timeout=None):
        seen.append(req.full_url)
        return Resp(buf.getvalue())
    monkeypatch.setattr(cards.urllib.request, "urlopen", fake)
    img = cards.fetch_thumb("https://assets.realufo.org/thumbs/SP ACE-1%20x.jpg")
    assert seen == ["https://assets.realufo.org/thumbs/SP%20ACE-1%20x.jpg"] and img.size == (2, 2)

def test_clip_lines_ellipsis_and_width():
    d = ImageDraw.Draw(Image.new("RGB", (10, 10)))
    f = cards.font(cards.SANS, 25, 400)
    lines = cards.wrap(d, " ".join(["paperwork"] * 40), f, 300)
    out = cards.clip_lines(d, lines, f, 300, 3)
    assert len(out) == 3 and out[-1].endswith("…") and all(d.textlength(l, font=f) <= 300 for l in out)
    assert cards.clip_lines(d, lines[:2], f, 300, 3) == lines[:2]

def test_render_long_bullets_and_long_one_liner():
    t = {"bullets": [" ".join(["classified"] * 40)] * 3, "one_liner": " ".join(["paperwork"] * 40)}
    for th in (Image.new("RGB", (640, 360)), None):
        assert cards.render(t, "DOW-UAP-D084", th).size == (1200, 630)

def test_card_key_and_url_encode_ids_with_spaces():
    key = cards.card_key("SP ACE-1", "abcdef0123456789")
    assert key == "cards/SP ACE-1-en-abcdef01.png"
    assert cards.card_url(key) == "https://assets.realufo.org/cards/SP%20ACE-1-en-abcdef01.png"

LONG_ID = "AARO-AARO_GoFast_Case_Resolution_Card_Methodology_Final.pdf"

def test_long_id_kicker_and_footer_are_clipped():
    d = ImageDraw.Draw(Image.new("RGB", (10, 10)))
    for has_thumb in (True, False):
        L = cards.layout(d, LONG_ID, has_thumb)
        assert d.textlength(L["kicker"], font=L["kf"]) <= L["width"]
        assert L["footer_x"] + d.textlength(L["footer"], font=L["mf"]) <= L["tldr_x"] - 24
        assert L["footer"].startswith("realufo.org/doc/AARO")
        cards.render(T, LONG_ID, Image.new("RGB", (640, 360)) if has_thumb else None)
    short = cards.layout(d, "DOW-UAP-D084", True)
    assert short["kicker"] == "DOW-UAP-D084" and short["footer"] == "realufo.org/doc/DOW-UAP-D084"
