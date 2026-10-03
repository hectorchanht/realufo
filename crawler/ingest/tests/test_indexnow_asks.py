from indexnow import ask_urls


def test_ask_urls_keeps_only_listed_ids_and_never_rebuilds_slugs():
    locs = [
        "https://realufo.org/ask/12-what-about-gimbal",
        "https://realufo.org/ask/13",
        "https://realufo.org/ask/130-other",
        "https://realufo.org/doc/ask-12",
        "https://realufo.org/archive",
    ]
    assert ask_urls(locs, {12, 13}) == ["https://realufo.org/ask/12-what-about-gimbal", "https://realufo.org/ask/13"]
    assert ask_urls(locs, set()) == []


def test_thread_urls_keeps_only_threads_with_new_replies():
    from indexnow import thread_urls
    locs = [
        "https://realufo.org/thread/t1",
        "https://realufo.org/thread/t%20two",
        "https://realufo.org/thread/t10",
        "https://realufo.org/board/uap",
    ]
    assert thread_urls(locs, {"t1", "t two"}) == ["https://realufo.org/thread/t1", "https://realufo.org/thread/t%20two"]
    assert thread_urls(locs, set()) == []


def test_changed_urls_sends_replied_threads_only(monkeypatch):
    import indexnow
    from ingest import d1
    def fake(sql):
        if "FROM posts" in sql:
            return [{"id": "t1"}]
        if "FROM records" in sql:
            return [{"id": "DOC-1"}]
        return []
    monkeypatch.setattr(d1, "_d1_json", fake)
    monkeypatch.setattr(indexnow, "sitemap_urls", lambda: [
        "https://realufo.org/", "https://realufo.org/doc/DOC-1", "https://realufo.org/doc/DOC-2",
        "https://realufo.org/thread/t1", "https://realufo.org/thread/t2"])
    assert indexnow.changed_urls(26) == [
        "https://realufo.org/", "https://realufo.org/doc/DOC-1", "https://realufo.org/thread/t1"]
    monkeypatch.setattr(d1, "_d1_json", lambda sql: [{"id": "t2"}] if "FROM posts" in sql else [])
    assert indexnow.changed_urls(26) == ["https://realufo.org/thread/t2"]
