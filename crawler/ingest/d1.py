import json, subprocess

def sql_q(v) -> str:
    if v is None or v == "":
        return "NULL"
    return "'" + str(v).replace("'", "''") + "'"

def emit_sql(cands, new_archives) -> str:
    lines = []
    for slug, a in (new_archives or {}).items():
        lines.append(
            "INSERT OR IGNORE INTO archives(id,label,flag,accent,count,coord) VALUES("
            f"{sql_q(slug)},{sql_q(a.get('label'))},{sql_q(a.get('flag'))},"
            f"{sql_q(a.get('accent'))},0,{sql_q(a.get('coord'))});")
    for c in cands:
        lines.append(
            "INSERT OR IGNORE INTO records(id,archive,agency,agency_full,title,summary,"
            "incident_date,location,doc_date,kind,redacted,featured,virin,source_url,"
            "source_site,license,status) VALUES("
            f"{sql_q(c.id)},{sql_q(c.archive)},{sql_q(c.agency)},{sql_q(c.agency_full)},"
            f"{sql_q(c.title)},{sql_q(c.summary)},{sql_q(c.incident_date)},{sql_q(c.location)},"
            f"{sql_q(c.doc_date)},{sql_q(c.kind)},{int(c.redacted)},0,{sql_q(c.virin)},"
            f"{sql_q(c.cdn_url)},{sql_q(c.archive)},'public-domain-usgov','live');")
        lines.append(
            "INSERT INTO assets(record_id,role,cdn_url,mime) "
            f"SELECT {sql_q(c.id)},'full',{sql_q(c.cdn_url)},{sql_q(c.mime)} "
            f"WHERE NOT EXISTS(SELECT 1 FROM assets WHERE record_id={sql_q(c.id)} AND role='full');")
        if c.thumb_url:
            lines.append(
                "INSERT INTO assets(record_id,role,cdn_url,mime) "
                f"SELECT {sql_q(c.id)},'thumb',{sql_q(c.thumb_url)},'image/jpeg' "
                f"WHERE NOT EXISTS(SELECT 1 FROM assets WHERE record_id={sql_q(c.id)} AND role='thumb');")
    return "\n".join(lines) + "\n"

def _d1_json(cmd_sql: str):
    out = subprocess.run(
        ["wrangler", "d1", "execute", "realufo-db", "--remote", "--json", "--command", cmd_sql],
        capture_output=True, text=True, check=True).stdout
    start = out.index("[")
    return json.loads(out[start:])[0]["results"]

def load_existing():
    ids = {r["id"] for r in _d1_json("SELECT id FROM records")}
    urls = {r["cdn_url"] for r in _d1_json("SELECT DISTINCT cdn_url FROM assets WHERE cdn_url IS NOT NULL")}
    urls |= {r["source_url"] for r in _d1_json("SELECT source_url FROM records WHERE source_url IS NOT NULL")}
    return ids, urls

def apply_sql(path: str) -> None:
    subprocess.run(["wrangler", "d1", "execute", "realufo-db", "--remote", "--file", path], check=True)
