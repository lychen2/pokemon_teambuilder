import re
from datetime import datetime, timezone

from .champions import normalize_showdown_id
from .io import fetch_text, write_json
from .paths import CHAMPIONS_VGC_PATH, STATIC_USAGE_PATH

SMOGON_STATS_ROOT = "https://www.smogon.com/stats/"
SMOGON_METAGAME = "gen9championsvgc2026regmb"
SMOGON_USAGE_WEIGHT = "0"
SMOGON_MONTH_PATTERN = re.compile(r"20\d{2}-\d{2}(?=/)")
USAGE_ROW_PATTERN = re.compile(
    r"^\|\s*(?P<rank>\d+)\s*\|\s*(?P<species>[^|]+?)\s*\|\s*(?P<usage>[\d.]+)%\s*\|\s*(?P<raw>\d+)\s*\|",
    re.MULTILINE,
)
SECTION_NAMES = {"Abilities", "Items", "Spreads", "Moves", "Teammates", "Checks and Counters"}
PERCENT_LINE_PATTERN = re.compile(r"^\|\s*(?P<name>.+?)\s+(?P<percent>[\d.]+)%\s*\|?\s*$")
COUNTER_LINE_PATTERN = re.compile(r"^\|\s*(?P<name>.+?)\s+(?P<score>[\d.]+)\s+\(")


def update_usage_data(champions_payload):
    print("Updating Champions VGC usage from Smogon stats.")
    active_format = champions_payload.get("format", {})
    expected_metagame = normalize_showdown_id(active_format.get("name"))
    month, source_url, usage_text = get_smogon_usage_text()
    moveset_url, moveset_text = get_smogon_moveset_text(month)
    entries = parse_usage_table(usage_text)
    if not entries:
        raise ValueError("Smogon usage table contained no ranked species")
    moveset_profiles = parse_moveset_table(moveset_text)
    total_ranked = len(entries)
    data = {}
    for entry in entries:
        data[entry["species"]] = {
            "Raw count": entry["rawCount"],
            "usage": entry["usagePercent"],
            "rank": entry["rank"],
            "usageRankScore": entry["usageRankScore"],
            "usagePercent": entry["usagePercent"],
            "sourceUrl": source_url,
            "detailSource": "smogon-moveset",
            "detailSourceUrl": moveset_url,
            **moveset_profiles.get(entry["species"], empty_moveset_profile()),
        }
    payload = {
        "info": {
            "metagame": SMOGON_METAGAME,
            "formatCode": SMOGON_METAGAME,
            "status": "available",
            "source": "smogon",
            "sourceUrl": source_url,
            "movesetSourceUrl": moveset_url,
            "activeFormat": active_format.get("name"),
            "expectedMetagame": expected_metagame,
            "month": month,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "rankedSpecies": total_ranked,
        },
        "data": data,
    }
    write_json(STATIC_USAGE_PATH, payload)
    update_champions_usage_metadata(payload["info"])
    return payload


def get_smogon_usage_text():
    index = fetch_text(SMOGON_STATS_ROOT)
    months = sorted(set(SMOGON_MONTH_PATTERN.findall(index)), reverse=True)
    for month in months:
        url = f"{SMOGON_STATS_ROOT}{month}/{SMOGON_METAGAME}-{SMOGON_USAGE_WEIGHT}.txt"
        try:
            return month, url, fetch_text(url)
        except Exception:
            continue
    raise ValueError(f"No Smogon usage stats found for {SMOGON_METAGAME}")


def get_smogon_moveset_text(month):
    url = f"{SMOGON_STATS_ROOT}{month}/moveset/{SMOGON_METAGAME}-{SMOGON_USAGE_WEIGHT}.txt"
    return url, fetch_text(url)


def parse_usage_table(text):
    rows = []
    for match in USAGE_ROW_PATTERN.finditer(text or ""):
        rows.append({
            "rank": int(match.group("rank")),
            "species": match.group("species").strip(),
            "usagePercent": float(match.group("usage")),
            "rawCount": int(match.group("raw")),
        })
    total = max(1, len(rows))
    for row in rows:
        row["usageRankScore"] = max(1, total - row["rank"] + 1)
    return rows


def parse_moveset_table(text):
    profiles = {}
    current_species = None
    current_section = None
    for raw_line in (text or "").splitlines():
        line = raw_line.rstrip()
        if line.startswith("+"):
            current_section = None
            continue
        if not line.startswith("|"):
            continue
        content = line.strip().strip("|").strip()
        if not content:
            continue
        if content in SECTION_NAMES:
            current_section = content
            continue
        if content.startswith("Raw count:") or content.startswith("Avg. weight:") or content.startswith("Viability Ceiling:"):
            continue
        if current_section is None:
            current_species = content
            profiles.setdefault(current_species, empty_moveset_profile())
            continue
        if not current_species:
            continue
        parsed = parse_detail_line(line, current_section)
        if not parsed:
            continue
        name, value = parsed
        if name == "Other":
            continue
        profiles[current_species][current_section][name] = value
    return profiles


def empty_moveset_profile():
    return {
        "Abilities": {},
        "Items": {},
        "Spreads": {},
        "Moves": {},
        "Teammates": {},
        "Checks and Counters": {},
    }


def parse_detail_line(line, section):
    if section == "Checks and Counters":
        match = COUNTER_LINE_PATTERN.match(line.strip())
        if not match:
            return None
        return match.group("name").strip(), float(match.group("score"))
    match = PERCENT_LINE_PATTERN.match(line.strip())
    if not match:
        return None
    return match.group("name").strip(), float(match.group("percent"))


def update_champions_usage_metadata(info):
    import json

    champions = json.loads(CHAMPIONS_VGC_PATH.read_text(encoding="utf-8"))
    champions["usage"] = {
        "status": info.get("status"),
        "source": info.get("source"),
        "formatCode": info.get("formatCode"),
        "expectedMetagame": info.get("expectedMetagame"),
        "month": info.get("month"),
        "sourceUrl": info.get("sourceUrl"),
        "movesetSourceUrl": info.get("movesetSourceUrl"),
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }
    CHAMPIONS_VGC_PATH.write_text(json.dumps(champions, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
