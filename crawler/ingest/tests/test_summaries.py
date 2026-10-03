import json
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
    sql = summaries.row_sql("AARO-x's.pdf", "A summary.")
    assert sql == "UPDATE record_text SET ai_summary='A summary.' WHERE record_id='AARO-x''s.pdf';"

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
