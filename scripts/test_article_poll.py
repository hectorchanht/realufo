#!/usr/bin/env python3
"""python3 scripts/test_article_poll.py — poll rules + CTA line of scripts/article.py."""
import importlib.util, os

spec = importlib.util.spec_from_file_location("article", os.path.join(os.path.dirname(__file__), "article.py"))
article = importlib.util.module_from_spec(spec)
spec.loader.exec_module(article)

ok = {"q": "Balloon or craft?", "opts": ["Balloon", "Drone", "Unknown craft", "Need more data"]}
assert article.poll_error(ok) is None
for bad in [{"q": "", "opts": ["a", "b"]}, {"q": "Q", "opts": ["a"]}, {"q": "Q", "opts": ["a", "b", "c", "d", "e"]},
            {"q": "Q", "opts": ["a", "a"]}, {"q": "Q", "opts": ["a", " "]}, {"q": "Q", "opts": ["a", "x" * 26]},
            {"q": "x" * 101, "opts": ["a", "b"]}, {"q": "Q", "opts": "ab"}, "nope"]:
    assert article.poll_error(bad), bad

assert article.cta({"poll": ok}, "ar_s") == "\nBalloon or craft? Vote → https://realufo.org/thread/ar_s"
assert article.cta({}, "ar_s") == "\nFull story: https://realufo.org/thread/ar_s"
print("ok")
