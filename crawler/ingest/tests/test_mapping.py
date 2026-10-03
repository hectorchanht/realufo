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

def test_derive_id_strips_curly_quotes():
    # Unicode curly quotes: U+201C (left) and U+201D (right)
    title_with_curly = "\u201cCIA-UAP-017, Foo\u201d"
    assert derive_id(title_with_curly, "wargov",
                     "https://assets.realufo.org/pdfs/wargov/x.pdf", set()) == "CIA-UAP-017"

def test_derive_id_hash_tier_avoids_taken_collision():
    import hashlib
    url = "https://assets.realufo.org/pdfs/wargov/no-code-here.pdf"
    h8 = "WARGOV-" + hashlib.sha256(url.encode()).hexdigest()[:8]
    taken = {"WARGOV-no-code-here", h8}   # force stem AND 8-hex both taken
    got = derive_id("no code here", "wargov", url, taken)
    assert got not in taken and got.startswith("WARGOV-")

def test_is_r2_hosted():
    assert is_r2_hosted("https://assets.realufo.org/pdfs/aaro/x.pdf")
    assert not is_r2_hosted("https://www.aaro.mil/x.jpg")
def test_derive_id_keeps_a_lowercase_part_suffix():
    # "PR057a" used to fail the \b after "PR057" and backtrack to "DOW-UAP"
    assert derive_id('DOW-UAP-PR057a, "Spherical UAP in clouds"', "wargov",
                     "https://assets.realufo.org/videos/wargov/DOD_111719752.mp4", set()) == "DOW-UAP-PR057a"
    assert derive_id("DOW-UAP-PR057, Foo", "wargov", "https://x/y.mp4", set()) == "DOW-UAP-PR057"

def test_derive_id_stops_at_an_underscore_before_words():
    # "\b" counts "_" as a word char, so "D085_Transmission" also fell back to "DOW-UAP"
    assert derive_id("DOW-UAP-D085_Transmission-of-CIA-Scientific-Advisory-Panel", "wargov",
                     "https://x/d085.pdf", set()) == "DOW-UAP-D085"
