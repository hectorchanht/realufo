"""Shared helpers for Phase 4 archive normalisers.

Public exports:

  * ``R2_BASE`` — module constant ``"https://assets.realufo.org"``. The
    custom-domain front of the Cloudflare R2 bucket ``realufo`` per
    `.planning/phases/04-full-migration-search-offline-performance/04-CONTEXT.md`
    decisions D-01..D-06.
  * ``rewrite_to_r2(local_path, archive_slug, asset_type)`` — rewrite a
    repo-relative or remote URL into the R2 URL contract
    ``{R2_BASE}/{asset_type}/{archive_slug}/{basename}``. Image-extension
    inputs are returned as-is per D-01 refinement + Pitfall #7
    (thumbnails stay local so Astro Image can process them).
  * ``slugify(text)`` — byte-equivalent port of
    ``scripts/snapshot-urls.py:slugify`` (which mirrors
    ``scripts/normalize-csv.py:_slugify``). Single source of truth for
    Wave 3+ per-archive normalisers so card anchor IDs stay synced with
    ``URL-CONTRACT.txt``.
  * ``pdf_thumb_url(pdf_url)`` — derive the canonical first-page JPG
    thumbnail URL for a PDF that lives on the R2 mirror. Used by
    ``normalize-csv.py`` + Card.astro / CatalogCard.astro to populate
    the ``Modal Image`` / ``th`` field when the source data carries no
    explicit thumbnail. ``scripts/build-pdf-thumbs.py`` renders + uploads
    the matching JPG to ``pdf-thumbs/<slug>/<basename>.jpg``.

Why ``_archive_common.py`` and not ``_r2_urls.py`` (as 04-RESEARCH.md §4
sketched): Wave 3+ archive normalisers will accumulate other shared
helpers (per-archive ``Source`` URL maps, common CSV-row schema
normalisation, etc.). One module to import is friendlier than fifteen
slug-keyed modules.

Pure stdlib (``re`` only); zero I/O, zero global mutation; safe to call
from any normaliser without side-effects. Matches the
``stdlib-only except curl_cffi`` convention from CLAUDE.md §6.2.

### Threat mitigations

- **T-04-05** (R2 token leak): this helper does NOT touch credentials.
  Token-handling is GH Actions ``r2-sync.yml`` scope only.
- **T-04-08** (CORS misconfiguration): irrelevant here — the helper
  emits URLs against the bound custom-domain origin which the bucket's
  CORS rules (operator-applied via ``wrangler r2 bucket cors set``)
  already restrict to ``https://realufo.org`` + preview origins.

### Cross-references

- ``.planning/decisions/r2-setup.md`` — bucket name, custom domain,
  secrets, A3 thumbnail decision.
- ``.planning/phases/04-full-migration-search-offline-performance/04-RESEARCH.md``
  §4 — URL pattern + bulk-migration rclone recipe.
- ``scripts/snapshot-urls.py`` — slugify source-of-truth.
- ``scripts/normalize-csv.py`` — first consumer; Wave 3+ archive
  normalisers will follow the same import pattern.
- ``scripts/build-pdf-thumbs.py`` — companion script that renders +
  uploads the JPGs ``pdf_thumb_url`` references.
"""
from __future__ import annotations

import re
from urllib.parse import unquote, urlparse

# Custom-domain front for the Cloudflare R2 bucket `realufo`
# (.planning/decisions/r2-setup.md). Constant — NOT configurable per
# environment; preview and production both serve from this origin so
# preview-vs-prod URL drift is impossible.
R2_BASE: str = 'https://assets.realufo.org'

# Image extensions are preserved verbatim per D-01 refinement + Pitfall
# #7. Astro Image processes LOCAL files for responsive srcset + format
# conversion; pushing thumbnails to R2 loses that path. The CSV may
# still hand the normaliser a `.png`/`.jpg`/`.webp`/`.svg` URL — in
# that case the helper returns the input untouched so downstream code
# preserves the original URL (already a stable origin like
# `https://www.war.gov/medialink/...`).
_IMAGE_EXTS: frozenset[str] = frozenset({
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif', '.bmp',
})

# Byte-for-byte port of `scripts/snapshot-urls.py:158-167` and
# `scripts/normalize-csv.py:117-119` (`_SLUG_RE`).
_SLUG_RE = re.compile(r'[^a-z0-9]+')

# Recognises an assets.realufo.org PDF URL and lets us derive the matching
# pdf-thumbs/<slug>/<basename>.jpg URL. Both ``.pdf`` and the rare ``.PDF``
# (uppercase, e.g. AARO Historical Record Report) match.
_PDF_URL_RE = re.compile(
    r'^https://assets\.realufo\.org/pdfs/(?P<slug>[a-z0-9_-]+)/(?P<basename>.+\.pdf)$',
    re.IGNORECASE,
)


def rewrite_to_r2(local_path: str, archive_slug: str, asset_type: str) -> str:
    """Rewrite a binary asset URL/path to the R2 custom-domain URL.

    Parameters
    ----------
    local_path : str
        Either a repo-relative path (``bundles/Release_1/foo.pdf``) or
        an absolute URL (``https://www.war.gov/medialink/.../foo.pdf``).
        The basename after the final ``/`` is extracted; everything
        else is discarded.
    archive_slug : str
        One of the 15 archive slugs (``wargov``, ``aaro``, ``nasa``,
        ``nara``, ``geipan``, ``uk``, ``brazil``, ``chile``,
        ``argentina``, ``canada``, ``italy``, ``nz``, ``peru``,
        ``spain``, ``uruguay``).
    asset_type : str
        ``'pdfs'`` or ``'videos'``. Maps to the R2 prefix path per
        D-05 (single bucket, prefix-based layout).

    Returns
    -------
    str
        Empty string if ``local_path`` is falsy. Original input if
        ``local_path`` ends with an image extension (per D-01
        refinement — thumbnails stay local for Astro Image). Otherwise
        ``f"{R2_BASE}/{asset_type}/{archive_slug}/{basename}"``.

    Notes
    -----
    The function does NOT verify the file actually exists in R2 — it
    is a pure URL transform. Existence is asserted by
    ``tests/r2-urls.spec.ts`` (post-migration HEAD-check sample).

    Examples
    --------
    >>> rewrite_to_r2('bundles/Release_1/foo.pdf', 'wargov', 'pdfs')
    'https://assets.realufo.org/pdfs/wargov/foo.pdf'
    >>> rewrite_to_r2(
    ...     'https://www.war.gov/medialink/ufo/release_1/dow-uap-d10.pdf',
    ...     'wargov', 'pdfs')
    'https://assets.realufo.org/pdfs/wargov/dow-uap-d10.pdf'
    >>> rewrite_to_r2('aaro/videos/y.mp4', 'aaro', 'videos')
    'https://assets.realufo.org/videos/aaro/y.mp4'
    >>> rewrite_to_r2('', 'wargov', 'pdfs')
    ''
    >>> rewrite_to_r2('thumbs/a.png', 'wargov', 'pdfs')
    'thumbs/a.png'
    """
    if not local_path:
        return ''
    # Image extensions stay local (D-01 refinement + Pitfall #7).
    # Lowercase ext check tolerates `.PNG`, `.Jpg`, etc.
    lower = local_path.lower()
    # Strip any query-string / fragment before extension check so that
    # `foo.png?cb=1` still triggers the image-preservation path.
    bare = lower.split('?', 1)[0].split('#', 1)[0]
    for ext in _IMAGE_EXTS:
        if bare.endswith(ext):
            return local_path
    filename = local_path.rsplit('/', 1)[-1]
    return f'{R2_BASE}/{asset_type}/{archive_slug}/{filename}'


def pdf_thumb_url(pdf_url: str) -> str:
    """Derive the first-page JPG thumbnail URL for an R2-hosted PDF.

    Convention (matches ``scripts/build-pdf-thumbs.py``):

        https://assets.realufo.org/pdfs/<slug>/<basename>.pdf
            ->
        https://assets.realufo.org/pdf-thumbs/<slug>/<basename>.jpg

    The basename case is preserved verbatim — wargov keys are lowercase,
    aaro/nasa/nara keys are mixed-case, so we must NOT toggle case here.
    URL-encoded characters in ``pdf_url`` (e.g. ``%20`` for spaces, the
    historical artefact in ``Case_Resolution_of%20_Western_United...``)
    are preserved in the output too — the thumbnail key in R2 mirrors
    whatever the consumer reads from the PDF URL field.

    Returns the empty string for inputs that aren't recognisable R2 PDF
    URLs (anything off the assets.realufo.org/pdfs/ prefix, anything
    that doesn't end in .pdf). Callers should fall back to the SVG
    placeholder via Card.astro's CSS :before guard.

    Examples
    --------
    >>> pdf_thumb_url('https://assets.realufo.org/pdfs/wargov/059uap00011.pdf')
    'https://assets.realufo.org/pdf-thumbs/wargov/059uap00011.jpg'
    >>> pdf_thumb_url('https://assets.realufo.org/pdfs/aaro/Mt-Etna-Object.pdf')
    'https://assets.realufo.org/pdf-thumbs/aaro/Mt-Etna-Object.jpg'
    >>> pdf_thumb_url('https://assets.realufo.org/pdfs/aaro/AARO_HISTORICAL_RECORD_REPORT_2024.PDF')
    'https://assets.realufo.org/pdf-thumbs/aaro/AARO_HISTORICAL_RECORD_REPORT_2024.jpg'
    >>> pdf_thumb_url('')
    ''
    >>> pdf_thumb_url('https://other.example.com/foo.pdf')
    ''
    """
    if not pdf_url:
        return ''
    m = _PDF_URL_RE.match(pdf_url)
    if not m:
        return ''
    slug = m.group('slug')
    basename = m.group('basename')
    # Strip the .pdf / .PDF extension and any case variants. rsplit on '.'
    # with limit 1 handles basenames containing dots before the extension
    # (e.g. western_us_event_slides_5.08.2026.pdf -> western_us_event_slides_5.08.2026).
    no_ext = basename.rsplit('.', 1)[0]
    return f'{R2_BASE}/pdf-thumbs/{slug}/{no_ext}.jpg'


def slugify(text: str) -> str:
    """Reduce free text to the stable ``#card-<slug>`` anchor form.

    Byte-equivalent port of ``scripts/snapshot-urls.py:158-167`` so the
    ``card-<slug>`` ids in shard HTML match the anchors recorded in
    ``URL-CONTRACT.txt`` (Phase 2 PMS-01 drift gate). Wave 3+ archive
    normalisers MUST import this function rather than re-implementing
    — drift between two ports of the same algorithm is the cheapest
    way to break ``URL-CONTRACT.txt`` for half the archives.

    Rules (verbatim from snapshot-urls.py):
      1. Lowercase the input.
      2. Replace runs of non-``[a-z0-9]`` with a single ``-``.
      3. Strip leading/trailing ``-``.
      4. Truncate to 80 chars.
      5. Strip again (truncation may leave a trailing ``-``).

    Examples
    --------
    >>> slugify('Hello World 2024!')
    'hello-world-2024'
    >>> slugify('  Multiple   spaces — em-dash  ')
    'multiple-spaces-em-dash'
    >>> slugify('')
    ''
    """
    if not text:
        return ''
    s = _SLUG_RE.sub('-', text.lower()).strip('-')
    return s[:80].strip('-')
