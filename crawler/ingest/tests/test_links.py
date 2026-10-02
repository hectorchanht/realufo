from ingest import links

def rec(i, title, summary=""):
    return {"id": i, "title": title, "summary": summary, "ai_summary": None}

def test_shared_rare_name_links_both_ways_and_generic_words_dont():
    rows = [rec("img", "Go Fast UAP"), rec("pdf", '"GO FAST" Case Resolution Methodology')]
    # filler so "go fast" is rare (< 5% of records) while "uap"/"case" are everywhere
    rows += [rec(f"f{n}", f"UAP case report number {n} radar track", f"case summary filler {n}") for n in range(60)]
    got = links.neighbours(rows)
    assert got["img"][0][0] == "pdf" and got["pdf"][0][0] == "img"
    assert all(o not in ("img", "pdf") for f in range(60) for o, _ in got[f"f{f}"])

def test_rows_sql_rewrites_table():
    sql = links.rows_sql({"a": [("b", 0.5), ("c", 0.4)], "b": []}, {("a", "c"), ("c", "a")})
    assert sql[0] == "DELETE FROM record_links;"
    assert sql[1:] == [
        "INSERT INTO record_links(record_id,related_id,score,source) VALUES('a','c',1,'official');",
        "INSERT INTO record_links(record_id,related_id,score,source) VALUES('c','a',1,'official');",
        "INSERT INTO record_links(record_id,related_id,score,source) VALUES('a','b',0.5000,'topic');",
    ]  # a->c is official, so no duplicate topic row

def test_official_pairs_exact_code_and_kind_from_column():
    def r(i, kind, title):
        return {"id": i, "kind": kind, "title": title}
    rows = [r("DOW-UAP-PR118", "video", "DOW-UAP-PR118, Gulf of Oman"),
            r("DOW-UAP-PR117", "video", "DOW-UAP-PR117, Gulf of Oman"),
            r("DOW-UAP-PR110", "video", "DOW-UAP-PR110, x"),
            r("DOW-UAP-PR101", "video", "DOW-UAP-PR101, x"),
            r("DOW-UAP-D101", "pdf", "DOW-UAP-D101, IIR"),
            r("DOW-UAP-PR019", "pdf", "DOW-UAP-PR019, a PDF"),
            r("WARGOV-VID-1", "video", "DOW-UAP-PR019, the video"),
            r("DOW-UAP-D077", "pdf", "DOW-UAP-D077, a PDF named in Video Pairing")]
    csv_rows = [{"Title": "DOW-UAP-PR118, Gulf of Oman", "Type": "VID",
                 "Video Pairing": "DOW-UAP-PR117 | DOW-UAP-PR11", "PDF Pairing": "DOW-UAP-PR-101"},
                {"Title": "DOW-UAP-PR019, a PDF", "Type": "PDF", "Video Pairing": "PR-019 | DOW-UAP-D077", "PDF Pairing": ""}]
    pairs, missing = links.official_pairs(csv_rows, rows)
    assert {b for a, b in pairs if a == "DOW-UAP-PR118"} == {"DOW-UAP-PR117", "DOW-UAP-D101"}
    assert ("DOW-UAP-D101", "DOW-UAP-PR118") in pairs  # both directions
    assert {b for a, b in pairs if a == "DOW-UAP-PR019"} == {"WARGOV-VID-1", "DOW-UAP-D077"}
    assert missing == ["DOW-UAP-PR11"]
