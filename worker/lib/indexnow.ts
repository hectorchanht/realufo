// worker/lib/indexnow.ts
// Same key and endpoint as crawler/indexnow.py; best effort (a failed ping never fails a post).
const KEY = "15c819920fcebcf77e8010d63ce74426";
export async function indexNow(urls: string[]) {
  if (!urls.length) return;
  await fetch("https://api.indexnow.org/indexnow", {
    method: "POST", headers: { "content-type": "application/json; charset=utf-8", "user-agent": "realufo-worker" },
    body: JSON.stringify({ host: "realufo.org", key: KEY, keyLocation: `https://realufo.org/${KEY}.txt`, urlList: urls.slice(0, 10000) }),
  }).catch(() => {});
}
