import io
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

def test_fetch_thumb_returns_none_on_error():
    assert cards.fetch_thumb("http://127.0.0.1:9/nope.jpg") is None
    assert cards.fetch_thumb(None) is None

def test_card_key_and_url_encode_ids_with_spaces():
    key = cards.card_key("SP ACE-1", "abcdef0123456789")
    assert key == "cards/SP ACE-1-en-abcdef01.png"
    assert cards.card_url(key) == "https://assets.realufo.org/cards/SP%20ACE-1-en-abcdef01.png"
