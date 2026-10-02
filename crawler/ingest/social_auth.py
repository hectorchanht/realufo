"""One-time social account setup for the fan-out bot (Spec 5 §5).

    cd crawler && set -a && . ../.env && set +a
    python3 -m ingest.social_auth bsky      # handle + app password -> secrets
    python3 -m ingest.social_auth meta      # Graph API Explorer user token -> META_PAGE_ID/TOKEN, IG_USER_ID
    python3 -m ingest.social_auth threads   # OAuth -> social_auth row + THREADS_USER_ID
    python3 -m ingest.social_auth tiktok    # OAuth -> social_auth row + client key/secret secrets
    python3 -m ingest.social_auth yt        # OAuth -> YT_CLIENT_ID/SECRET/REFRESH_TOKEN secrets

OAuth flows redirect to https://realufo.org/?code=... (register exactly that URI in
each app console); paste the full address-bar URL back here. Secrets go to the
Worker via `wrangler secret put` on stdin, never printed.
"""
import getpass, json, os, secrets, subprocess, sys
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode, urlparse, parse_qs
from urllib.request import Request, urlopen
from . import d1

REDIRECT = "https://realufo.org/"
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
GRAPH = "https://graph.facebook.com/v25.0"

def consent_url(platform, env, state) -> str:
    if platform == "threads":
        return "https://threads.net/oauth/authorize?" + urlencode({"client_id": env["THREADS_APP_ID"], "redirect_uri": REDIRECT,
            "scope": "threads_basic,threads_content_publish", "response_type": "code", "state": state})
    if platform == "tiktok":
        return "https://www.tiktok.com/v2/auth/authorize/?" + urlencode({"client_key": env["TIKTOK_CLIENT_KEY"], "redirect_uri": REDIRECT,
            "scope": "user.info.basic,video.publish", "response_type": "code", "state": state})
    if platform == "yt":
        return "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode({"client_id": env["YT_CLIENT_ID"], "redirect_uri": REDIRECT,
            "response_type": "code", "scope": "https://www.googleapis.com/auth/youtube.upload", "access_type": "offline",
            "prompt": "consent", "state": state})
    raise ValueError(platform)

def code_from(pasted, state) -> str:
    qs = {k: v[0] for k, v in parse_qs(urlparse(pasted.strip()).query).items()}
    if qs.get("state") != state:
        sys.exit("state mismatch — paste the URL from this run's consent page")
    if "code" not in qs:
        sys.exit(f"no code in URL: {qs.get('error', '?')} {qs.get('error_description', '')}")
    return qs["code"]

def upsert_sql(platform, access, refresh, expires_in, now) -> str:
    exp = (now + timedelta(seconds=int(expires_in))).strftime("%Y-%m-%d %H:%M:%S")
    ts = now.strftime("%Y-%m-%d %H:%M:%S")
    return ("INSERT INTO social_auth(platform,access_token,refresh_token,expires_at,updated_at) VALUES("
            f"{d1.sql_q(platform)},{d1.sql_q(access)},{d1.sql_q(refresh)},{d1.sql_q(exp)},{d1.sql_q(ts)}) "
            "ON CONFLICT(platform) DO UPDATE SET access_token=excluded.access_token, refresh_token=excluded.refresh_token, "
            "expires_at=excluded.expires_at, updated_at=excluded.updated_at;")

def _http(url, data=None, method=None):
    req = Request(url, data=urlencode(data).encode() if data else None, method=method or ("POST" if data else "GET"),
                  headers={"Content-Type": "application/x-www-form-urlencoded"})
    with urlopen(req, timeout=30) as r:
        return json.loads(r.read())

def _secret(name, value):
    env = {k: v for k, v in os.environ.items() if k not in ("CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID")}
    subprocess.run(["npx", "wrangler", "secret", "put", name, "--env-file", "/dev/null"], input=value, text=True, cwd=ROOT, env=env, check=True)
    print(f"secret {name} set")

def _oauth(platform, env):
    state = secrets.token_urlsafe(16)
    print("Open, approve, then paste the full URL you land on (https://realufo.org/?code=...):\n\n  " + consent_url(platform, env, state) + "\n")
    return code_from(input("URL: "), state)

def _now():
    return datetime.now(timezone.utc)

def bsky(env):
    handle, pw = input("Bluesky handle: ").strip(), getpass.getpass("App password: ")
    req = Request("https://bsky.social/xrpc/com.atproto.server.createSession", data=json.dumps({"identifier": handle, "password": pw}).encode(),
                  headers={"Content-Type": "application/json"})
    with urlopen(req, timeout=30) as r:
        print("login ok:", json.loads(r.read())["did"])
    _secret("BSKY_HANDLE", handle)
    _secret("BSKY_APP_PASSWORD", pw)

def meta(env):
    short = getpass.getpass("Short-lived USER token from Graph API Explorer (pages_show_list, pages_manage_posts, "
                            "pages_read_engagement, instagram_basic, instagram_content_publish, business_management): ")
    long_user = _http(f"{GRAPH}/oauth/access_token?" + urlencode({"grant_type": "fb_exchange_token", "client_id": env["META_APP_ID"],
                      "client_secret": env["META_APP_SECRET"], "fb_exchange_token": short}))["access_token"]
    pages = _http(f"{GRAPH}/me/accounts?" + urlencode({"access_token": long_user}))["data"]
    for i, p in enumerate(pages):
        print(f"[{i}] {p['name']} ({p['id']})")
    page = pages[int(input("Page #: ") or 0)]
    ig = _http(f"{GRAPH}/{page['id']}?" + urlencode({"fields": "instagram_business_account", "access_token": page["access_token"]}))
    _secret("META_PAGE_ID", page["id"])
    _secret("META_PAGE_TOKEN", page["access_token"])  # page token from a long-lived user token does not expire
    if ig.get("instagram_business_account"):
        _secret("IG_USER_ID", ig["instagram_business_account"]["id"])
    else:
        print("WARNING: no Instagram Business/Creator account linked to this Page; IG stays unconfigured")

def threads(env):
    code = _oauth("threads", env)
    short = _http("https://graph.threads.net/oauth/access_token", {"client_id": env["THREADS_APP_ID"], "client_secret": env["THREADS_APP_SECRET"],
                  "grant_type": "authorization_code", "redirect_uri": REDIRECT, "code": code})
    long = _http("https://graph.threads.net/access_token?" + urlencode({"grant_type": "th_exchange_token",
                 "client_secret": env["THREADS_APP_SECRET"], "access_token": short["access_token"]}))
    d1.execute(upsert_sql("threads", long["access_token"], None, long["expires_in"], _now()))
    _secret("THREADS_USER_ID", str(short["user_id"]))

def tiktok(env):
    code = _oauth("tiktok", env)
    t = _http("https://open.tiktokapis.com/v2/oauth/token/", {"client_key": env["TIKTOK_CLIENT_KEY"], "client_secret": env["TIKTOK_CLIENT_SECRET"],
              "code": code, "grant_type": "authorization_code", "redirect_uri": REDIRECT})
    if "access_token" not in t:
        sys.exit(f"tiktok token exchange failed: {t}")
    d1.execute(upsert_sql("tiktok", t["access_token"], t["refresh_token"], t["expires_in"], _now()))
    _secret("TIKTOK_CLIENT_KEY", env["TIKTOK_CLIENT_KEY"])
    _secret("TIKTOK_CLIENT_SECRET", env["TIKTOK_CLIENT_SECRET"])

def yt(env):
    code = _oauth("yt", env)
    t = _http("https://oauth2.googleapis.com/token", {"code": code, "client_id": env["YT_CLIENT_ID"], "client_secret": env["YT_CLIENT_SECRET"],
              "redirect_uri": REDIRECT, "grant_type": "authorization_code"})
    if "refresh_token" not in t:
        sys.exit("no refresh_token returned — revoke the app at myaccount.google.com/permissions and retry")
    _secret("YT_CLIENT_ID", env["YT_CLIENT_ID"])
    _secret("YT_CLIENT_SECRET", env["YT_CLIENT_SECRET"])
    _secret("YT_REFRESH_TOKEN", t["refresh_token"])

def main(argv=None):
    cmds = {"bsky": bsky, "meta": meta, "threads": threads, "tiktok": tiktok, "yt": yt}
    argv = sys.argv[1:] if argv is None else argv
    if len(argv) != 1 or argv[0] not in cmds:
        sys.exit(f"usage: python -m ingest.social_auth {{{'|'.join(cmds)}}}")
    try:
        cmds[argv[0]](os.environ)
    except KeyError as e:
        sys.exit(f"missing {e.args[0]} in ../.env")

if __name__ == "__main__":
    main()
