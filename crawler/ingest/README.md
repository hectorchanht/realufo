# ingest — scheduled US UAP auto-mirror

Runs in GitHub Actions. Crawls wargov/aaro/nasa/nara, mirrors new files to R2,
upserts D1. Idempotent: re-runs only add what's new.

## Secrets (repo Settings → Actions)
- CLOUDFLARE_API_TOKEN — custom token: Account · Workers R2 Storage · Edit +
  Account · D1 · Edit, scoped to account f1868a071996e836eae6da2b65f37929
- CLOUDFLARE_ACCOUNT_ID — f1868a071996e836eae6da2b65f37929

## Run locally (dry)
    cd crawler && pip install -r ingest/requirements.txt
    CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... python -m ingest --dry-run

## First live run
1. Actions → ingest → Run workflow → dry_run=false, sources=nara (small).
2. Verify: curl https://realufo.org/api/records?archive=nara
3. When happy, flip the workflow's scheduled run to real (remove the --dry-run
   default in ingest.yml) and let the daily cron take over.
