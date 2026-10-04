import pytest

np = pytest.importorskip("numpy")  # review tool runs in .venv-ocr; CI's ingest env has no numpy


def test_transients_find_a_fleeting_dot_and_ignore_camera_shake():
    from ingest.moment_sheets import group, transients
    rng = np.random.default_rng(0)
    base = rng.integers(60, 90, (60, 80)).astype(np.int16)
    f = np.stack([base.copy() for _ in range(8)])
    f[3, 30:33, 10:13] = 250          # dot crosses in frames 3-4, gone after
    f[4, 28:31, 40:43] = 250
    f[6] = np.roll(base, 5, axis=1)   # one-frame whole-picture jolt = shake, not an object
    hits = transients(f)
    assert [i for i, _ in hits] == [3, 4]
    assert len(group(hits)) == 1
