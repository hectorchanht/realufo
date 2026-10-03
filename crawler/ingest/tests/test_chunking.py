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

def test_chunks_for_adds_ai_summary_and_moments_after_card_before_pages():
    moments = '{"moments": [{"start": 0.0, "end": 9.6, "text": "A bright light at frame centre."},' \
              ' {"start": 65.2, "end": 80, "text": "The light drifts left."}]}'
    r = {"id": "V", "title": "Vid", "ai_summary": "An infrared frame.", "ai_moments": moments}
    out = chunks_for(r, ["Line of report text about the radar contact. " * 5])
    assert [c["page"] for c in out] == [0, 0, 0, 1]
    assert out[1]["text"] == "Vid — AI summary\nAn infrared frame."
    assert out[2]["text"] == "Vid — AI key moments\n0:00 A bright light at frame centre.\n1:05 The light drifts left."

def test_chunks_for_ignores_missing_or_bad_moments():
    assert len(chunks_for({"id": "X", "title": "T", "ai_moments": "not json"}, [])) == 1
    assert len(chunks_for({"id": "X", "title": "T", "ai_summary": None, "ai_moments": None}, [])) == 1

def test_section_summaries_become_chunks_with_their_first_page():
    import json
    r = {"id": "X", "title": "T", "summary": None, "ai_summary": "Sum.", "ai_moments": None,
         "ai_sections": json.dumps([{"from": 1, "to": 12, "text": "Memos."}, {"from": 13, "to": 13, "text": "A map."}])}
    cs = [{"page": c["page"], "text": c["text"]} for c in chunks_for(r, [])]
    assert {"page": 1, "text": "T — pp. 1–12\nMemos."} in cs
    assert {"page": 13, "text": "T — p. 13\nA map."} in cs

def test_bad_or_missing_sections_are_ignored():
    r = {"id": "X", "title": "T", "summary": None, "ai_summary": None, "ai_moments": None, "ai_sections": "not json"}
    assert len(chunks_for(r, [])) == 1
