import json, sqlite3
import pytest
from ingest import summaries

PAGES = [{"n": 1, "text": "First page."}, {"n": 3, "text": "Third page."}]

def test_model_input_keeps_page_numbers():
    assert summaries.model_input(PAGES) == "[Page 1]\nFirst page.\n\n[Page 3]\nThird page."

def test_model_input_caps_characters():
    pages = [{"n": i, "text": "x" * 5000} for i in range(1, 10)]
    assert len(summaries.model_input(pages, cap=12000)) <= 12000

def test_clean_summary_strips_think_and_whitespace():
    raw = "<think>hmm</think>\n  The memo   describes a radar contact over the base in 1952, logged by two operators who tracked it for ten minutes. "
    assert summaries.clean_summary(raw).startswith("The memo describes a radar contact")

def test_clean_summary_rejects_empty_or_refusal_length():
    assert summaries.clean_summary("<think>only thinking") is None
    assert summaries.clean_summary("Too short.") is None
    assert summaries.clean_summary(None) is None

def test_clean_summary_caps_long_output_at_a_sentence():
    raw = " ".join(f"Sentence {i} reports another detail about the sighting." for i in range(40))
    out = summaries.clean_summary(raw)
    assert len(out.split()) <= summaries.MAX_WORDS and out.endswith(".")

def test_row_sql_updates_only_that_record():
    sql = summaries.row_sql("AARO-x's.pdf", "A summary.", None)
    assert sql == ("UPDATE record_text SET ai_summary='A summary.', ai_sections=NULL WHERE record_id='AARO-x''s.pdf';"
                   "UPDATE text_index SET status='failed' WHERE record_id='AARO-x''s.pdf';")   # Ask re-embeds it

def test_chat_body_disables_thinking(monkeypatch):
    seen = {}
    def fake_call(path, body, ctype="application/json"):
        seen["path"], seen["body"] = path, json.loads(body)
        return {"choices": [{"message": {"content": "ok"}}]}
    monkeypatch.setattr(summaries.cfapi, "_call", fake_call)
    assert summaries.cfapi.chat("sys", "user") == "ok"
    assert seen["path"] == "/ai/run/@cf/qwen/qwen3-30b-a3b-fp8"
    assert seen["body"]["chat_template_kwargs"] == {"enable_thinking": False}
    assert seen["body"]["messages"][0] == {"role": "system", "content": "sys"}

def test_system_prompt_has_date_rules():
    s = summaries.SYSTEM
    assert "redacted" in s and "290141Z OCT25" in s and "29 October 2025" in s

LONG = "The radar operator logged a contact over the base at night. " * 40   # 2,440 chars

def test_sections_pack_pages_split_long_pages_and_skip_empty():
    pages = [(1, "a" * 5000), (2, ""), (3, "b" * 5000), (4, "c" * 5000), (5, "d" * 30000)]
    secs = summaries.sections(pages, size=12000)
    assert [(s["from"], s["to"]) for s in secs] == [(1, 3), (4, 4), (5, 5), (5, 5), (5, 5)]
    assert all(len(s["text"]) <= 12000 for s in secs)
    assert summaries.sections([(1, "  "), (2, "")]) == []

def test_page_label():
    assert summaries.page_label(5, 5) == "p. 5"
    assert summaries.page_label(5, 12) == "pp. 5\u201312"

def _fake_chat(calls):
    def chat(system, user, max_tokens=400, temperature=0.2):
        calls.append((system, user))
        if "pages contain" in system:
            return "FBI memos about saucer reports near Seattle in 1952 and the follow-up interviews."
        if "group of section summaries" in system:
            return "Seattle-area saucer reports and interviews from the FBI field office."
        return ("This is an FBI investigative file from 1952 about reports of flying objects over Washington State, "
                "with witness interviews, memos between field offices and a summary of what each witness described.")
    return chat

def test_summarize_single_section_is_one_call_without_sections():
    calls = []
    summary, secs = summaries.summarize("T", [(1, LONG)], chat=_fake_chat(calls))
    assert len(calls) == 1 and secs is None and summary.startswith("This is an FBI")

def test_summarize_maps_then_reduces_and_returns_sections():
    calls = []
    pages = [(n, LONG) for n in range(1, 13)]                      # 12 x 2,440 chars -> 4 pages per 12k section
    summary, secs = summaries.summarize("T", pages, chat=_fake_chat(calls))
    assert [(s["from"], s["to"]) for s in secs] == [(1, 4), (5, 8), (9, 12)]
    assert sum("pages contain" in c[0] for c in calls) == 3
    assert "[pp. 1\u20134]" in calls[-1][1] and "FBI investigative file" in summary

def test_summarize_reduces_in_layers_when_the_section_list_is_long(monkeypatch):
    monkeypatch.setattr(summaries, "SECTION", 3000)                 # force many sections + a long list
    calls = []
    pages = [(n, LONG) for n in range(1, 81)]
    summary, secs = summaries.summarize("T", pages, chat=_fake_chat(calls))
    assert len(secs) == 80 and any("group of section summaries" in c[0] for c in calls)
    assert len(calls[-1][1]) < 3000 + 500                           # final reduce input fits

def test_summary_length_scales_with_page_count():
    calls = []
    summaries.summarize("T", [(n, "x y z " * 300) for n in range(1, 41)], chat=_fake_chat(calls))
    assert "200 words" in calls[-1][0]
    calls.clear()
    summaries.summarize("T", [(1, LONG)], chat=_fake_chat(calls))
    assert "120 words" in calls[-1][0]

def test_summarize_raises_when_a_section_reply_is_junk():
    def chat(system, user, **_):
        return "" if "pages contain" in system else "fine " * 30
    with pytest.raises(ValueError):
        summaries.summarize("T", [(n, LONG) for n in range(1, 13)], chat=chat)

def test_row_sql_stores_summary_and_sections_and_requeues_ask():
    db = sqlite3.connect(":memory:")
    db.executescript("CREATE TABLE record_text(record_id TEXT PRIMARY KEY, ai_summary TEXT, ai_sections TEXT);"
                     "CREATE TABLE text_index(record_id TEXT PRIMARY KEY, status TEXT);"
                     "INSERT INTO record_text VALUES('A''s',NULL,NULL); INSERT INTO text_index VALUES('A''s','indexed');")
    db.executescript(summaries.row_sql("A's", "Sum.", [{"from": 1, "to": 2, "text": "x"}]))
    assert db.execute("SELECT ai_summary, ai_sections FROM record_text").fetchone() == ("Sum.", '[{"from": 1, "to": 2, "text": "x"}]')
    assert db.execute("SELECT status FROM text_index").fetchone() == ("failed",)

def test_select_picks_long_files_without_sections():
    assert "ai_sections IS NULL" in summaries.SELECT and "record_ocr" in summaries.SELECT

def test_a_transient_model_error_is_retried_not_fatal(monkeypatch):
    monkeypatch.setattr(summaries.time, "sleep", lambda s: None)
    calls, base = [], _fake_chat([])
    def flaky(system, user, **k):
        calls.append(1)
        if len(calls) == 2:
            raise RuntimeError("429 Too Many Requests")
        return base(system, user, **k)
    summary, secs = summaries.summarize("T", [(n, LONG) for n in range(1, 13)], chat=flaky)
    assert len(secs) == 3 and summary

def test_stored_sections_fall_back_to_a_coarser_level_when_too_big_for_d1(monkeypatch):
    # NDAA (973 pp) -> 260 sections -> JSON over D1's ~100 KB statement limit (SQLITE_TOOBIG, pilot 2026-10-03)
    monkeypatch.setattr(summaries, "SECTION", 3000)
    monkeypatch.setattr(summaries, "SECTIONS_MAX_BYTES", 2000)
    calls = []
    summary, secs = summaries.summarize("T", [(n, LONG) for n in range(1, 81)], chat=_fake_chat(calls))
    assert len(json.dumps(secs, ensure_ascii=False).encode()) <= 2000
    assert secs[0]["from"] == 1 and secs[-1]["to"] == 80 and len(secs) < 80

def test_each_record_is_written_alone_so_one_bad_row_fails_only_itself(monkeypatch):
    rows = [{"id": "A", "title": "T", "pages": '[{"n":1,"text":"x"}]', "url": None, "ocr": 0},
            {"id": "B", "title": "T", "pages": '[{"n":1,"text":"x"}]', "url": None, "ocr": 0}]
    monkeypatch.setattr(summaries.d1, "_d1_json", lambda sql: rows)
    monkeypatch.setattr(summaries, "summarize", lambda title, pages: ("Sum.", None))
    written = []
    def flush(lines, work):
        if "'A'" in lines[0]:
            raise RuntimeError("statement too long: SQLITE_TOOBIG")
        written.append(lines)
    monkeypatch.setattr(summaries, "flush", flush)
    with pytest.raises(SystemExit) as e:
        summaries.main([])
    assert e.value.code == 1 and len(written) == 1 and "'B'" in written[0][0]

def test_section_text_is_cut_at_a_sentence_end_not_mid_list():
    raw = ("The pages contain an FBI reply to Mrs. Dow about a saucer club. A convention form lists speakers and events "
           "for July 1966. Dates: August 31, 1966; July 1966; September 2, 1966; October 4, 1966; and several more later entries.")
    t = summaries._short(raw, 20)  # 37 words > 20 + 10 slack
    assert t.endswith(".") and "Dates:" not in t

def test_prompts_forbid_absence_claims_and_page_restating():
    for p in (summaries.SYSTEM, summaries.SECTION_SYSTEM, summaries.GROUP_SYSTEM):
        assert "does not mention" in p          # the rule names the forbidden claim
    for p in (summaries.SECTION_SYSTEM, summaries.GROUP_SYSTEM):
        assert "page numbers" in p and "UFO" in p

def test_absence_claims_are_dropped_from_model_text():
    t = ("Legal provisions on military justice and recruitment, with no mention of UFOs, UAP or unidentified objects. "
         "It covers funding and procurement. The text does not mention flying saucers elsewhere.")
    assert summaries._drop_absence(t) == "It covers funding and procurement."
    assert summaries._drop_absence("No mention of UFOs.") == "No mention of UFOs."   # never empty a reply

def test_a_page_opener_that_repeats_the_section_range_is_stripped_but_narrower_refs_stay():
    assert summaries._tidy("Pages 74–79 contain a letter to J. Edgar Hoover.", 74, 79) == "A letter to J. Edgar Hoover."
    assert summaries._tidy("Pages describe a 1966 issue of a saucer magazine.", 9, 9) == "A 1966 issue of a saucer magazine."
    assert summaries._tidy("Page 9 mentions a convention.", 9, 9) == "A convention."
    assert summaries._tidy("Pages 564–567 discuss UAP records.", 533, 669) == "Pages 564–567 discuss UAP records."

def test_final_reduce_says_the_list_describes_one_document():
    calls = []
    summaries.summarize("T", [(n, LONG) for n in range(1, 13)], chat=_fake_chat(calls))
    assert "ONE document" in calls[-1][1]

def test_final_summary_drops_absence_claims_too():
    def chat(system, user, **_):
        return ("This is the 2024 NDAA with UAP records disclosure rules and many defense provisions for the services and the budget. "
                "It does not mention flying saucers anywhere else in the text at all.")
    out, _ = summaries.summarize("T", [(1, LONG)], chat=chat)
    assert "does not mention" not in out and out.startswith("This is the 2024 NDAA")
