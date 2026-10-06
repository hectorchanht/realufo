// RealUFO's own public profiles. One list for the site footer and the home
// page's JSON-LD `sameAs` (ties the accounts to the site as one entity).
export const SOCIAL_PROFILES: [name: string, url: string][] = [
  ["X", "https://x.com/realufo_org"],
  ["Bluesky", "https://bsky.app/profile/realufo.bsky.social"],
  ["Facebook", "https://www.facebook.com/realufo.org/"],
  ["Instagram", "https://www.instagram.com/realufo_org/"],
  ["Threads", "https://www.threads.com/@realufo_org"],
  ["YouTube", "https://www.youtube.com/@realufo_org"],
  ["Ko-fi", "https://ko-fi.com/realufo"],
];

// Open dataset (records + page text) exported by scripts/export_dataset.py.
// NOTE: the old tung00 namespace 301s here — link the final URL directly.
export const DATASET_URL = "https://huggingface.co/datasets/realufo/realufo-uap-archive";
