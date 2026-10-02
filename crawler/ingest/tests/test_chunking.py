from ingest.chunking import vector_id, split_pages, chunk_page, card_text, chunks_for, CHUNK

LONG_ID = "AARO-AARO_GoFast_Case_Resolution_Card_Methodology_Final.pdf" * 3

def test_vector_id_short_deterministic_and_unique_per_seq():
    a, b = vector_id(LONG_ID, 0), vector_id(LONG_ID, 12345)
    assert len(a.encode()) <= 64 and len(b.encode()) <= 64
    assert a == vector_id(LONG_ID, 0) and a != b
    assert vector_id("X", 0) != vector_id("Y", 0)

def test_split_pages_on_form_feed_dropping_trailing_empty():
    assert split_pages("one\ftwo\f") == ["one", "two"]
    assert split_pages("") == []

def test_chunk_page_sizes_overlap_and_sentence_breaks():
    text = " ".join(f"Sentence number {i} about the radar contact." for i in range(200))
    chunks = chunk_page(text)
    assert len(chunks) > 3
    assert all(len(c) <= CHUNK for c in chunks)
    assert all(c.endswith(".") for c in chunks[:-1])           # breaks at sentence ends
    for a, b in zip(chunks, chunks[1:]):
        assert b[:40] in a                                      # overlap: next chunk starts inside the previous
    assert "Sentence number 199" in chunks[-1]

def test_chunk_page_drops_ocr_noise():
    assert chunk_page(".,;' -- ~~ |\n" * 80) == []

def test_card_text_skips_missing_fields():
    r = {"title": "T", "agency": "NASA", "incident_date": None, "location": "", "summary": "S"}
    assert card_text(r) == "T — NASA\nS"
    assert card_text({"title": "T"}) == "T"

def test_chunks_for_card_first_then_prefixed_pages_with_seq_ids():
    r = {"id": "REC-1", "title": "Doc", "agency": "AARO", "summary": "sum"}
    page = " ".join(f"Line {i} of the report text." for i in range(30))
    out = chunks_for(r, ["", page])
    assert out[0] == {"id": vector_id("REC-1", 0), "page": 0, "text": "Doc — AARO\nsum"}
    assert out[1]["page"] == 2 and out[1]["text"].startswith("Doc — p.2\n")
    assert [c["id"] for c in out] == [vector_id("REC-1", i) for i in range(len(out))]
