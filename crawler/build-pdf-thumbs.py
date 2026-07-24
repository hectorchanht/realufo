#!/usr/bin/env python3
"""Render PDF page 1 → JPG thumb, upload to R2 at pdf-thumbs/<slug>/<basename>.jpg.

Pipeline:
    1. Enumerate every PDF URL referenced by data/{wargov,aaro,nasa,nara}.json
       (+ wargov shards) — the canonical inventory the cards consume.
    2. For each URL: locate or download the source PDF into a local cache
       under /tmp/pdf-thumb-cache/<slug>/<basename>.pdf.
    3. Render page 1 with pdftoppm (poppler) → JPG (~800 px wide, q=80).
    4. Skip files already present in R2 at pdf-thumbs/<slug>/<basename>.jpg
       (idempotent; checked via aws s3 head-object).
    5. Upload missing thumbs to R2.

R2 key convention:
    Bucket:  realufo
    Prefix:  pdf-thumbs/<slug>/
    Object:  <basename-without-extension>.jpg  (EXACT case, matches PDF URL)

The card markup (Card.astro + CatalogCard.astro + render_card_html) derives
the thumb URL from the PDF URL when the data file's Modal Image / th field
is empty — see scripts/_archive_common.py:pdf_thumb_url() for the
derivation. This script does NOT mutate any data file.

Stdlib only (urllib + subprocess + json) — matches CLAUDE.md §6.2 stdlib
convention. R2 upload uses the `aws` CLI with operator-supplied keys via
env vars (AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY) + the R2 S3 endpoint.

CLI:
    python3 scripts/build-pdf-thumbs.py              full run (idempotent)
    python3 scripts/build-pdf-thumbs.py --dry-run    list what would happen
    python3 scripts/build-pdf-thumbs.py --slug aaro  only one archive

Exit codes:
    0 — success
    1 — at least one source PDF unreachable (catalogued; thumb skipped)
    2 — missing dependency (pdftoppm / aws / data files)
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.parse import unquote, urlparse

REPO = Path(__file__).resolve().parent.parent
DATA_DIR = REPO / 'data'
CACHE_DIR = Path(os.environ.get('PDF_THUMB_CACHE', '/tmp/pdf-thumb-cache'))
THUMB_DIR = Path(os.environ.get('PDF_THUMB_OUTPUT', '/tmp/pdf-thumbs'))

R2_ENDPOINT = 'https://f1868a071996e836eae6da2b65f37929.r2.cloudflarestorage.com'
R2_BUCKET = 'realufo'
R2_THUMB_PREFIX = 'pdf-thumbs'

ASSETS_BASE = 'https://assets.realufo.org'
PDF_URL_RE = re.compile(
    # PDF URLs in wargov shard HTML strings are JSON-escaped quoted attr
    # values (`data-url=\"https://...pdf\"`). Filenames carry literal
    # spaces (`serial 5 redacted_redacted.pdf`) and unicode characters
    # (en-dash in `1944–1945`); stop at the closing escaped quote
    # (which JSON encodes as `\\"`).
    r'https://assets\.realufo\.org/pdfs/(?P<slug>[a-z]+)/(?P<basename>[^\\<>]+?\.pdf)',
    re.IGNORECASE,
)

# Per-archive local-PDF source directories. The script tries these BEFORE
# falling back to a network download — saves bandwidth + avoids R2 round-trip
# on the first thumb-rendering run for already-committed binaries.
LOCAL_SOURCES = {
    'wargov': [REPO / 'bundles' / 'Release_1', REPO / 'bundles' / 'release_02_document_bundle'],
    'aaro':   [REPO / 'aaro' / 'pdfs', Path('/tmp/r2-scrape/aaro')],
    'nasa':   [REPO / 'nasa' / 'pdfs', Path('/tmp/r2-scrape/nasa')],
    'nara':   [REPO / 'nara' / 'pdfs', Path('/tmp/r2-scrape/nara')],
}

UA = (
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
)


def _require_tool(name: str) -> None:
    if shutil.which(name) is None:
        sys.stderr.write(f'[error] required tool not found on PATH: {name}\n')
        sys.exit(2)


def _enumerate_pdf_urls() -> list[str]:
    """Return the sorted unique set of PDF URLs the cards reference."""
    urls: set[str] = set()

    # wargov: primary rows + sharded HTML strings
    primary = json.loads((DATA_DIR / 'wargov.json').read_text(encoding='utf-8'))
    for row in primary.get('v1', {}).get('rows', []) or []:
        u = (row.get('PDF | Image Link') or '').strip()
        if u and u.lower().endswith('.pdf') and u.startswith(ASSETS_BASE):
            urls.add(u)
    for shard_path in sorted(DATA_DIR.glob('wargov-shard-*.json')):
        text = shard_path.read_text(encoding='utf-8')
        for m in PDF_URL_RE.finditer(text):
            urls.add(m.group(0))

    # catalog archives
    for slug in ('aaro', 'nasa', 'nara'):
        path = DATA_DIR / f'{slug}.json'
        if not path.exists():
            continue
        envelope = json.loads(path.read_text(encoding='utf-8'))
        for a in envelope.get('v1', {}).get('assets', []) or []:
            if (a.get('t') or '') in ('PDF', 'DOC'):
                u = (a.get('u') or '').strip()
                if u and u.lower().endswith('.pdf') and u.startswith(ASSETS_BASE):
                    urls.add(u)

    return sorted(urls)


def _basename_from_url(url: str) -> tuple[str, str, str]:
    """Return (slug, basename, basename_no_ext) for an assets.realufo.org PDF URL."""
    parsed = urlparse(url)
    parts = unquote(parsed.path).strip('/').split('/')
    # /pdfs/<slug>/<basename>
    if len(parts) < 3 or parts[0] != 'pdfs':
        raise ValueError(f'unexpected PDF URL shape: {url}')
    slug = parts[1]
    basename = parts[-1]
    no_ext = basename.rsplit('.', 1)[0] if '.' in basename else basename
    return slug, basename, no_ext


def _try_local(slug: str, basename: str) -> Path | None:
    """Look up a local copy of `basename` under each archive's source dir.

    Tolerant of case-folding: matches `basename` case-insensitively against
    each candidate filename in the source directory listing. Wargov bundles
    were originally uppercase (`059UAP00011.pdf`) but the recased R2 keys
    are lowercase — the local file on disk is still the uppercase one, so
    case-insensitive lookup is essential.
    """
    for src in LOCAL_SOURCES.get(slug, []):
        if not src.is_dir():
            continue
        # Fast path: exact match
        exact = src / basename
        if exact.is_file():
            return exact
        # Case-insensitive fallback
        lower = basename.lower()
        try:
            for entry in src.iterdir():
                if entry.is_file() and entry.name.lower() == lower:
                    return entry
        except OSError:
            continue
    return None


def _download_from_r2(slug: str, basename: str, dest: Path) -> bool:
    """Fall back to downloading the PDF from the live R2 mirror.

    Used for archives where we don't keep a local committed copy (most
    catalogs). The URL is the public assets.realufo.org CDN path; no R2
    credentials needed. Returns True on success.
    """
    url = f'{ASSETS_BASE}/pdfs/{slug}/{basename}'
    dest.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        'curl', '-fsSL', '--retry', '2', '--max-time', '120',
        '-A', UA, '-o', str(dest), url,
    ]
    try:
        rc = subprocess.run(cmd, check=False).returncode
    except FileNotFoundError:
        sys.stderr.write('[error] curl not on PATH\n')
        return False
    if rc != 0 or not dest.is_file() or dest.stat().st_size == 0:
        if dest.exists():
            dest.unlink()
        return False
    return True


def _render_page1(pdf_path: Path, jpg_path: Path) -> bool:
    """Render page 1 of `pdf_path` to `jpg_path` as ~800px-wide JPG q=80.

    Uses pdftoppm with -scale-to-x 800 to control output width directly.
    pdftoppm appends a zero-padded page-number suffix to the prefix; the
    width of the suffix depends on the PDF's total page count
    (`-1.jpg`, `-01.jpg`, `-001.jpg`, ...). We glob for any matching
    suffix after the call rather than guessing the width.

    Output is written into a fresh tempdir with a sanitized prefix to
    avoid pdftoppm's shell-glob misbehaviour with `[]` characters in the
    output prefix path. The rendered JPG is then moved to ``jpg_path``.
    """
    jpg_path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='pdftoppm_') as td:
        tmp_dir = Path(td)
        tmp_prefix = tmp_dir / 'page'
        try:
            cmd = [
                'pdftoppm', '-jpeg',
                '-jpegopt', 'quality=80,optimize=y',
                '-scale-to-x', '800',
                '-scale-to-y', '-1',
                '-f', '1', '-l', '1',
                str(pdf_path), str(tmp_prefix),
            ]
            rc = subprocess.run(cmd, check=False,
                                stdout=subprocess.DEVNULL,
                                stderr=subprocess.PIPE).returncode
            if rc != 0:
                return False
        except FileNotFoundError:
            return False
        # Pick whatever -NN.jpg pdftoppm wrote (the suffix width varies).
        produced_list = sorted(tmp_dir.glob('page-*.jpg'))
        produced = produced_list[0] if produced_list else None
        if produced is None:
            single = tmp_prefix.with_suffix('.jpg')
            if single.is_file():
                produced = single
            else:
                return False
        shutil.move(str(produced), str(jpg_path))
    return True


def _r2_object_exists(slug: str, basename_no_ext: str) -> bool:
    """Return True if pdf-thumbs/<slug>/<no_ext>.jpg already exists in R2."""
    key = f'{R2_THUMB_PREFIX}/{slug}/{basename_no_ext}.jpg'
    cmd = [
        'aws', 's3api', 'head-object',
        '--bucket', R2_BUCKET, '--key', key,
        '--endpoint-url', R2_ENDPOINT,
    ]
    try:
        rc = subprocess.run(cmd, check=False,
                            stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL).returncode
    except FileNotFoundError:
        sys.stderr.write('[error] aws CLI not on PATH\n')
        sys.exit(2)
    return rc == 0


def _r2_upload(slug: str, basename_no_ext: str, jpg_path: Path) -> bool:
    """Upload jpg_path to pdf-thumbs/<slug>/<no_ext>.jpg."""
    key = f's3://{R2_BUCKET}/{R2_THUMB_PREFIX}/{slug}/{basename_no_ext}.jpg'
    cmd = [
        'aws', 's3', 'cp', str(jpg_path), key,
        '--endpoint-url', R2_ENDPOINT,
        '--content-type', 'image/jpeg',
        '--cache-control', 'public, max-age=31536000, immutable',
    ]
    rc = subprocess.run(cmd, check=False,
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.PIPE).returncode
    return rc == 0


def _process_one(url: str, dry_run: bool = False) -> tuple[str, str]:
    """Return (status, detail) for the URL. Status one of:
        ok / skip / fail_source / fail_render / fail_upload.
    """
    slug, basename, no_ext = _basename_from_url(url)

    if _r2_object_exists(slug, no_ext):
        return ('skip', f'pdf-thumbs/{slug}/{no_ext}.jpg already in R2')

    if dry_run:
        return ('ok', f'would render + upload pdf-thumbs/{slug}/{no_ext}.jpg')

    pdf_local = _try_local(slug, basename)
    if pdf_local is None:
        # Cache from R2
        cache_path = CACHE_DIR / slug / basename
        if not cache_path.is_file():
            if not _download_from_r2(slug, basename, cache_path):
                return ('fail_source', f'could not fetch {url}')
        pdf_local = cache_path

    jpg_path = THUMB_DIR / slug / f'{no_ext}.jpg'
    if not _render_page1(pdf_local, jpg_path):
        return ('fail_render', f'pdftoppm failed for {pdf_local}')

    if not _r2_upload(slug, no_ext, jpg_path):
        return ('fail_upload', f'aws s3 cp failed for {jpg_path}')

    return ('ok', f'rendered + uploaded pdf-thumbs/{slug}/{no_ext}.jpg')


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=(
            'Build first-page JPG thumbnails for every PDF the realufo.org '
            'cards reference, and upload to R2 at pdf-thumbs/<slug>/<basename>.jpg. '
            'Idempotent — already-uploaded thumbs are skipped via HEAD lookup.'
        ),
    )
    parser.add_argument('--dry-run', action='store_true',
                        help='List actions without rendering or uploading.')
    parser.add_argument('--slug', choices=['wargov', 'aaro', 'nasa', 'nara'],
                        help='Only process one archive.')
    parser.add_argument('--limit', type=int, default=0,
                        help='Stop after N URLs (debugging).')
    args = parser.parse_args(argv)

    _require_tool('pdftoppm')
    _require_tool('aws')
    _require_tool('curl')
    if not os.environ.get('AWS_ACCESS_KEY_ID'):
        sys.stderr.write(
            '[error] AWS_ACCESS_KEY_ID env var not set. Export the R2 keys '
            'before running (see CLAUDE.md §5.1 / debug session manager).\n'
        )
        return 2

    urls = _enumerate_pdf_urls()
    if args.slug:
        urls = [u for u in urls if f'/pdfs/{args.slug}/' in u]
    if args.limit:
        urls = urls[: args.limit]

    sys.stderr.write(f'[info] {len(urls)} PDF URLs to process\n')
    counts: dict[str, int] = {}
    failures: list[tuple[str, str]] = []
    for i, url in enumerate(urls, 1):
        status, detail = _process_one(url, dry_run=args.dry_run)
        counts[status] = counts.get(status, 0) + 1
        if i % 25 == 0 or status.startswith('fail'):
            sys.stderr.write(f'[{i}/{len(urls)}] {status:14s} {detail}\n')
        if status.startswith('fail'):
            failures.append((url, detail))

    sys.stderr.write('\n[summary] ' + ', '.join(
        f'{k}={v}' for k, v in sorted(counts.items())
    ) + '\n')
    if failures:
        sys.stderr.write(f'[warn] {len(failures)} failures:\n')
        for url, detail in failures[:20]:
            sys.stderr.write(f'  - {detail}: {url}\n')
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
