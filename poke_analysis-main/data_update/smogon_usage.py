import json
import re
from datetime import datetime, timezone

import requests

from .champions import normalize_showdown_id
from .io import fetch_text, load_json, write_json
from .paths import CHAMPIONS_VGC_PATH, STATIC_USAGE_PATH

SMOGON_STATS_ROOT = "https://www.smogon.com/stats"
RECENT_STATS_MONTHS = 6
PREFERRED_USAGE_RATINGS = ("1500", "1630", "1760", "0")
SPREAD_PATTERN = re.compile(r"^[A-Za-z]+:\d+/\d+/\d+/\d+/\d+/\d+$")


def update_usage_data(champions_payload):
    print("Checking Smogon Champions VGC usage.")
    active_format = champions_payload.get("format", {})
    expected_metagame = normalize_showdown_id(active_format.get("name"))
    recent_usage = find_recent_usage_url(expected_metagame)
    if not recent_usage:
        write_unavailable_usage(expected_metagame, active_format)
        return None
    month, usage_url, rating = recent_usage
    payload = download_usage_payload(month, usage_url, rating, expected_metagame, active_format)
    write_json(STATIC_USAGE_PATH, payload)
    update_champions_usage_metadata(month, usage_url, rating, expected_metagame)
    return payload


def iter_recent_complete_months(count):
    now = datetime.now(timezone.utc)
    year = now.year
    month = now.month - 1
    if month == 0:
        year -= 1
        month = 12
    for _ in range(count):
        yield f"{year:04d}-{month:02d}"
        month -= 1
        if month == 0:
            year -= 1
            month = 12


def find_recent_usage_url(expected_metagame):
    for month in iter_recent_complete_months(RECENT_STATS_MONTHS):
        index_url = f"{SMOGON_STATS_ROOT}/{month}/chaos/"
        try:
            index_html = fetch_text(index_url)
        except requests.RequestException as error:
            print(f"Skipping {index_url}: {error}")
            continue
        candidates = matching_usage_filenames(index_html, expected_metagame)
        if candidates:
            selected = sorted(candidates, key=usage_file_sort_key)[0]
            rating = selected.rsplit("-", 1)[1].removesuffix(".json")
            return month, f"{index_url}{selected}", rating
    return None


def matching_usage_filenames(index_html, expected_metagame):
    pattern = re.compile(rf"^{re.escape(expected_metagame)}-(\d+)\.json$", re.IGNORECASE)
    filenames = sorted(set(re.findall(r"(gen[^\s\"'>]+\.json)", index_html, flags=re.IGNORECASE)))
    return [filename for filename in filenames if pattern.match(filename)]


def usage_file_sort_key(filename):
    rating = filename.rsplit("-", 1)[1].removesuffix(".json")
    rating_rank = PREFERRED_USAGE_RATINGS.index(rating) if rating in PREFERRED_USAGE_RATINGS else len(PREFERRED_USAGE_RATINGS)
    return rating_rank, filename


def download_usage_payload(month, usage_url, rating, expected_metagame, active_format):
    print(f"Downloading Champions VGC usage from {month}: {usage_url}")
    payload = json.loads(fetch_text(usage_url))
    validate_usage_payload(payload, expected_metagame)
    info = {
        **(payload.get("info") or {}),
        "status": "available",
        "sourceUrl": usage_url,
        "month": month,
        "rating": int(rating) if str(rating).isdigit() else rating,
        "activeFormat": active_format.get("name"),
        "expectedMetagame": expected_metagame,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }
    return {**payload, "info": info}


def validate_usage_payload(payload, expected_metagame):
    info = payload.get("info")
    data = payload.get("data")
    if not isinstance(info, dict):
        raise ValueError("Smogon usage payload is missing info")
    if normalize_showdown_id(info.get("metagame")) != expected_metagame:
        raise ValueError(f"Usage metagame mismatch: {info.get('metagame')} != {expected_metagame}")
    if not isinstance(data, dict):
        raise ValueError("Smogon usage payload data must be an object")
    if not data:
        raise ValueError("Smogon usage payload has no species data")
    validate_usage_profiles(data)


def validate_usage_profiles(data):
    for species, profile in data.items():
        if not isinstance(profile, dict):
            raise ValueError(f"Usage profile for {species} must be an object")
        spreads = profile.get("Spreads")
        if spreads is not None and not isinstance(spreads, dict):
            raise ValueError(f"Usage spreads for {species} must be an object")
        invalid_spreads = [key for key in (spreads or {}) if not SPREAD_PATTERN.match(str(key))]
        if invalid_spreads:
            print(f"  Ignoring malformed spread keys for {species}: {invalid_spreads[:3]}")


def write_unavailable_usage(expected_metagame, active_format):
    reason = f"No Smogon chaos usage file matched {expected_metagame} in the last {RECENT_STATS_MONTHS} complete months."
    print(reason)
    payload = {
        "info": {
            "status": "unavailable",
            "reason": reason,
            "expectedMetagame": expected_metagame,
            "activeFormat": active_format.get("name"),
            "generatedAt": datetime.now(timezone.utc).isoformat(),
        },
        "data": {},
    }
    write_json(STATIC_USAGE_PATH, payload)
    update_champions_usage_metadata(None, None, None, expected_metagame, reason)


def update_champions_usage_metadata(month, source_url, rating, expected_metagame, reason=""):
    champions = load_json(CHAMPIONS_VGC_PATH)
    champions["usage"] = {
        "status": "unavailable" if reason else "available",
        "expectedMetagame": expected_metagame,
        "month": month,
        "rating": int(rating) if str(rating).isdigit() else rating,
        "sourceUrl": source_url,
        "reason": reason,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }
    write_json(CHAMPIONS_VGC_PATH, champions)
