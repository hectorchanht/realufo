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
    sql = links.rows_sql({"a": [("b", 0.5)], "b": []})
    assert sql[0] == "DELETE FROM record_links;"
    assert sql[1] == "INSERT INTO record_links(record_id,related_id,score) VALUES('a','b',0.5000);"
