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
