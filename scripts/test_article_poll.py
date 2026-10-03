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
# X weighting (worker/lib/xcopy.ts weightedLength): URL = 23, emoji/CJK = 2
assert article.weighted_len("abc https://realufo.org/thread/ar_x") == 4 + 23
assert article.weighted_len("👇") == 2 and article.weighted_len("—") == 1
# the CTA must not push the last tweet past 280 (xcopy fit() would cut the link off)
a = {"parts": ["x" * 200], "poll": ok}
assert article.last_part_error(a, "ar_s") is None
a = {"parts": ["x" * 240], "poll": ok}
assert "over by" in article.last_part_error(a, "ar_s")

# opts freeze: votes exist → the poll can't be dropped, re-added with new opts, or re-ordered
stored = '{"q": "Q", "opts": ["a", "b"]}'
assert article.freeze_error(stored, 0, None) is None  # no votes: anything goes
assert article.freeze_error(stored, 3, '{"q": "New Q", "opts": ["a", "b"]}') is None  # wording may change
assert article.freeze_error(stored, 3, '{"q": "Q", "opts": ["b", "a"]}')
assert article.freeze_error(stored, 3, None)  # dropping a voted poll
assert article.freeze_error(None, 3, '{"q": "Q", "opts": ["x", "y"]}')  # re-adding after a drop
print("ok")
