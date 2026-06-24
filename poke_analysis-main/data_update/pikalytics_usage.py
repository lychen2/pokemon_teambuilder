import re
from datetime import datetime, timezone

from .champions import normalize_showdown_id
from .io import fetch_text, load_json, write_json
from .paths import CHAMPIONS_VGC_PATH, STATIC_USAGE_PATH

PIKALYTICS_FORMAT_CODE = "battledataregmbs3"
PIKALYTICS_AI_ROOT = f"https://www.pikalytics.com/ai/pokedex/{PIKALYTICS_FORMAT_CODE}"
TOP_TABLE_PATTERN = re.compile(
    r"^\|\s*(?P<rank>\d+)\s*\|\s*\*\*(?P<species>[^*]+)\*\*\s*\|\s*(?P<usage>[^|]+?)\s*\|\s*(?P<winrate>[^|]+?)\s*\|\s*(?P<record>[^|]+?)\s*\|",
    re.MULTILINE,
)
SECTION_PATTERN = re.compile(r"^## (?P<title>.+)$", re.MULTILINE)
BULLET_PERCENT_PATTERN = re.compile(r"^- \*\*(?P<name>[^*]+)\*\*: (?P<percent>[-\d.]+)%", re.MULTILINE)
SPREAD_PATTERN = re.compile(r"EV spread of `(?P<spread>\d+/\d+/\d+/\d+/\d+/\d+)`.*?(?P<percent>[-\d.]+)%", re.IGNORECASE | re.DOTALL)
STAT_KEYS = ("hp", "atk", "def", "spa", "spd", "spe")
SPREAD_LABELS = ("HP", "Atk", "Def", "SpA", "SpD", "Spe")


def update_usage_data(champions_payload):
    print("Updating Champions VGC usage from Pikalytics.")
    active_format = champions_payload.get("format", {})
    expected_metagame = normalize_showdown_id(active_format.get("name"))
    overview = fetch_text(PIKALYTICS_AI_ROOT)
    ranked_species = parse_ranked_species(overview)
    if not ranked_species:
        raise ValueError("Pikalytics overview contained no ranked species")
    previous_data = load_previous_usage_data()
    data = {}
    errors = []
    for entry in ranked_species:
        try:
            species_markdown = fetch_text(entry["aiUrl"])
            data[entry["species"]] = parse_species_profile(entry, species_markdown)
        except Exception as error:
            previous_profile = previous_data.get(entry["species"])
            if previous_profile:
                data[entry["species"]] = previous_profile
                errors.append(f"{entry['species']}: reused previous profile after {error}")
            else:
                errors.append(f"{entry['species']}: {error}")
    if errors:
        print("Skipped Pikalytics species:")
        for error in errors[:20]:
            print(f"  {error}")
    if not data:
        raise ValueError("Pikalytics usage update produced no species data")
    payload = {
        "info": {
            "metagame": expected_metagame,
            "formatCode": PIKALYTICS_FORMAT_CODE,
            "status": "available",
            "source": "pikalytics",
            "sourceUrl": PIKALYTICS_AI_ROOT,
            "activeFormat": active_format.get("name"),
            "expectedMetagame": expected_metagame,
            "month": infer_data_date(overview),
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "skippedSpeciesErrors": errors,
        },
        "data": data,
    }
    write_json(STATIC_USAGE_PATH, payload)
    update_champions_usage_metadata(payload["info"])
    return payload


def parse_ranked_species(markdown):
    out = []
    for match in TOP_TABLE_PATTERN.finditer(markdown):
        species = match.group("species").strip()
        out.append({
            "rank": int(match.group("rank")),
            "species": species,
            "usagePercent": parse_percent(match.group("usage")),
            "winRate": parse_percent(match.group("winrate")),
            "record": match.group("record").strip(),
            "aiUrl": f"{PIKALYTICS_AI_ROOT}/{species.replace(' ', '-')}",
        })
    return out


def parse_species_profile(entry, markdown):
    sections = split_sections(markdown)
    profile = {
        "Raw count": parse_record_total(entry.get("record", "")),
        "usage": max(0, 100 - entry["rank"] + 1),
        "rank": entry["rank"],
        "usageRankScore": max(0, 100 - entry["rank"] + 1),
        "usagePercent": entry.get("usagePercent"),
        "winRate": entry.get("winRate"),
        "record": entry.get("record"),
        "sourceUrl": entry["aiUrl"],
        "Moves": percent_record(sections.get("Common Moves", "")),
        "Abilities": percent_record(sections.get("Common Abilities", "")),
        "Items": percent_record(sections.get("Common Items", "")),
        "Teammates": teammate_record(sections.get("Common Teammates", "")),
        "Spreads": {},
    }
    spread = parse_spread(markdown)
    if spread:
        profile["Spreads"] = spread
    return profile


def split_sections(markdown):
    matches = list(SECTION_PATTERN.finditer(markdown))
    sections = {}
    for index, match in enumerate(matches):
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(markdown)
        sections[match.group("title").strip()] = markdown[start:end]
    return sections


def percent_record(section):
    return {
        match.group("name").strip(): float(match.group("percent"))
        for match in BULLET_PERCENT_PATTERN.finditer(section or "")
    }


def teammate_record(section):
    out = {}
    for line in (section or "").splitlines():
        match = re.match(r"^- \*\*(?P<name>[^*]+)\*\*: (?P<percent>[-\d.]+|undefined)%", line.strip())
        if not match:
            continue
        raw_percent = match.group("percent")
        out[match.group("name").strip()] = 0.0 if raw_percent == "undefined" else float(raw_percent)
    return out


def parse_spread(markdown):
    match = SPREAD_PATTERN.search(markdown or "")
    if not match:
        return {}
    values = [int(value) for value in match.group("spread").split("/")]
    if len(values) != len(STAT_KEYS):
        return {}
    key = "Hardy:" + "/".join(str(value) for value in values)
    return {
        key: float(match.group("percent")),
    }


def parse_percent(value):
    raw = str(value or "").strip().removesuffix("%")
    if raw.upper() == "N/A" or not raw:
        return None
    return float(raw)

def parse_record_total(record):
    values = [int(value) for value in re.findall(r"\d+", str(record or ""))]
    return sum(values)


def infer_data_date(markdown):
    text = markdown or ""
    match = re.search(r"\*\*Data Date\*\*:?\s*\|?\s*(?P<date>\d{4}-\d{2})", text)
    return match.group("date") if match else None


def load_previous_usage_data():
    try:
        payload = load_json(STATIC_USAGE_PATH)
    except FileNotFoundError:
        return {}
    return payload.get("data") or {}

def update_champions_usage_metadata(info):
    champions = load_json(CHAMPIONS_VGC_PATH)
    champions["usage"] = {
        "status": info.get("status"),
        "source": info.get("source"),
        "formatCode": info.get("formatCode"),
        "expectedMetagame": info.get("expectedMetagame"),
        "month": info.get("month"),
        "sourceUrl": info.get("sourceUrl"),
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }
    write_json(CHAMPIONS_VGC_PATH, champions)
