from datetime import datetime, timezone
from urllib.parse import urlparse, parse_qs
import pytest
from ingest.social_auth import consent_url, code_from, upsert_sql, REDIRECT

ENV = {"THREADS_APP_ID": "th-app", "TIKTOK_CLIENT_KEY": "tt-key", "YT_CLIENT_ID": "yt-id"}

def q(url):
    return {k: v[0] for k, v in parse_qs(urlparse(url).query).items()}

def test_consent_urls_carry_redirect_scope_and_state():
    th = q(consent_url("threads", ENV, "S1"))
    assert th == {"client_id": "th-app", "redirect_uri": REDIRECT, "scope": "threads_basic,threads_content_publish", "response_type": "code", "state": "S1"}
    tt = q(consent_url("tiktok", ENV, "S1"))
    assert tt["client_key"] == "tt-key" and tt["scope"] == "user.info.basic,video.publish" and tt["state"] == "S1"
    yt = q(consent_url("yt", ENV, "S1"))
    assert yt["access_type"] == "offline" and yt["prompt"] == "consent"
    assert yt["scope"] == "https://www.googleapis.com/auth/youtube.upload"

def test_code_from_checks_state_and_strips_meta_suffix():
    assert code_from("https://realufo.org/?code=AbC%2B1&state=S1#_", "S1") == "AbC+1"
    with pytest.raises(SystemExit):
        code_from("https://realufo.org/?code=x&state=EVIL", "S1")
    with pytest.raises(SystemExit):
        code_from("https://realufo.org/?error=access_denied&state=S1", "S1")

def test_upsert_sql_quotes_and_computes_expiry():
    now = datetime(2026, 10, 10, 12, 0, 0, tzinfo=timezone.utc)
    sql = upsert_sql("tiktok", "a'b", "r1", 86400, now)
    assert "INSERT INTO social_auth(platform,access_token,refresh_token,expires_at,updated_at)" in sql
    assert "'a''b'" in sql and "'2026-10-11 12:00:00'" in sql
    assert "ON CONFLICT(platform) DO UPDATE SET" in sql
    assert "NULL" in upsert_sql("threads", "t", None, 5184000, now)
