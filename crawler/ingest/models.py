from dataclasses import dataclass

R2_BASE = "https://assets.realufo.org"
KIND_FROM_TYPE = {"PDF": "pdf", "VID": "video", "IMG": "image"}
MIME = {"pdf": "application/pdf", "video": "video/mp4", "image": "image/jpeg"}

@dataclass
class Candidate:
    id: str
    archive: str
    agency: str
    agency_full: str
    title: str
    summary: str
    incident_date: str
    location: str
    doc_date: str
    kind: str            # pdf | image | video
    redacted: int
    virin: str
    r2_key: str          # e.g. "videos/wargov/DOD_123.mp4"
    cdn_url: str         # R2_BASE + "/" + r2_key
    mime: str
    thumb_url: str       # R2 thumb url or ""
