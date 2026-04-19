import json
import re
from datetime import datetime, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
STATS_DIR = ROOT / "poke_analysis-main" / "stats"
STATIC_DIR = ROOT / "static"
CORE_JSON_FILES = {
    "items.json",
    "abilities.json",
    "moves.json",
    "learnsets.json",
    "pokedex.json",
    "forms_index.json",
    "formats.json",
    "champions_vgc.json",
}
STATIC_USAGE_PATH = STATIC_DIR / "usage.json"
TEXT_SOURCES = (
    ("https://play.pokemonshowdown.com/data/items.js", STATS_DIR / "items.json", "items"),
    ("https://play.pokemonshowdown.com/data/abilities.js", STATS_DIR / "abilities.json", "abilities"),
    ("https://play.pokemonshowdown.com/data/moves.json", STATS_DIR / "moves.json", "moves"),
    ("https://play.pokemonshowdown.com/data/pokedex.json", STATS_DIR / "pokedex.json", "pokedex"),
)
BINARY_SOURCES = (
    ("https://play.pokemonshowdown.com/sprites/pokemonicons-sheet.png", STATIC_DIR / "pokemonicons-sheet.png", "pokemon icons"),
    ("https://play.pokemonshowdown.com/sprites/itemicons-sheet.png", STATIC_DIR / "itemicons-sheet.png", "item icons"),
)
FORMS_SOURCE = "https://play.pokemonshowdown.com/js/battle-dex-data.js"
FORMATS_SOURCE = "https://play.pokemonshowdown.com/data/formats.js"
TEAMBUILDER_SOURCE = "https://play.pokemonshowdown.com/data/teambuilder-tables.js"
LEARNSETS_SOURCE = "https://play.pokemonshowdown.com/data/learnsets.js"
CHAMPIONS_VGC_NAME_PATTERN = re.compile(r"^\[Gen \d+ Champions\] VGC\b")
SMOGON_STATS_ROOT = "https://www.smogon.com/stats"
RECENT_STATS_MONTHS = 6
CHAMPIONS_USAGE_FILENAME_PATTERN = re.compile(
    r"^(gen\d+[a-z0-9]*champions[a-z0-9]*vgc[a-z0-9]*(?:bo3)?)-(?P<rating>\d+)\.json$",
    re.IGNORECASE,
)
PREFERRED_USAGE_RATINGS = ("1500", "1630", "1760", "0")


def ensure_directories():
    STATS_DIR.mkdir(parents=True, exist_ok=True)
    STATIC_DIR.mkdir(parents=True, exist_ok=True)


def prune_usage_files():
    removed = 0
    for path in STATS_DIR.glob("*.json"):
        if path.name in CORE_JSON_FILES:
            continue
        path.unlink()
        removed += 1
    print(f"Removed {removed} metagame/usage files.")


def fetch_text(url):
    response = requests.get(url, timeout=60)
    response.raise_for_status()
    return response.text


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


def extract_usage_filenames(index_html):
    matches = re.findall(r"(gen[^\s\"'>]+\.json)", index_html, flags=re.IGNORECASE)
    return sorted(set(matches))


def usage_file_sort_key(filename):
    match = CHAMPIONS_USAGE_FILENAME_PATTERN.match(filename)
    if not match:
        return (1, len(PREFERRED_USAGE_RATINGS), filename)
    rating = match.group("rating")
    bo3_penalty = 1 if "bo3" in filename.lower() else 0
    rating_rank = PREFERRED_USAGE_RATINGS.index(rating) if rating in PREFERRED_USAGE_RATINGS else len(PREFERRED_USAGE_RATINGS)
    return (bo3_penalty, rating_rank, filename)


def find_recent_champions_usage_url():
    for month in iter_recent_complete_months(RECENT_STATS_MONTHS):
        index_url = f"{SMOGON_STATS_ROOT}/{month}/chaos/"
        try:
            index_html = fetch_text(index_url)
        except requests.RequestException as error:
            print(f"Skipping {index_url}: {error}")
            continue
        candidates = [
            filename for filename in extract_usage_filenames(index_html)
            if CHAMPIONS_USAGE_FILENAME_PATTERN.match(filename)
        ]
        if not candidates:
            continue
        selected = sorted(candidates, key=usage_file_sort_key)[0]
        return month, f"{index_url}{selected}"
    return None


def json5_to_json(text):
    return re.sub(r'([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)(\s*:)', r'\1"\2"\3', text)


def normalize_species_id(value):
    return re.sub(r"[^a-z0-9]+", "", str(value or "").lower())


def load_json5_object(path):
    return json.loads(json5_to_json(path.read_text(encoding="utf-8")))


def format_name_list(names):
    cleaned_names = [str(name).strip() for name in names if str(name).strip()]
    if not cleaned_names:
        return ""
    if len(cleaned_names) == 1:
        return cleaned_names[0]
    if len(cleaned_names) == 2:
        return f"{cleaned_names[0]} or {cleaned_names[1]}"
    return f"{', '.join(cleaned_names[:-1])}, or {cleaned_names[-1]}"


def enrich_champions_item_overrides(base_items, override_items):
    enriched = {}
    for item_id, patch in override_items.items():
        merged = {**base_items.get(item_id, {}), **patch}
        next_patch = dict(patch)
        if merged.get("desc") or merged.get("shortDesc") or not merged.get("megaStone"):
            enriched[item_id] = next_patch
            continue
        users = merged.get("itemUser") or list((merged.get("megaStone") or {}).keys())
        user_label = format_name_list(users)
        if not user_label:
            enriched[item_id] = next_patch
            continue
        description = f"If held by {user_label}, this item allows it to Mega Evolve in battle."
        next_patch["desc"] = description
        next_patch["shortDesc"] = description
        enriched[item_id] = next_patch
    return enriched


def parse_exported_array(source, export_name):
    match = re.search(rf"exports\.{export_name}\s*=\s*(\[[\s\S]*\]);\s*$", source)
    if not match:
        raise ValueError(f"{export_name} not found")
    return json.loads(json5_to_json(match.group(1)))


def parse_exported_object(source, export_name):
    match = re.search(rf"exports\.{export_name}\s*=\s*(\{{[\s\S]*\}});?\s*$", source)
    if not match:
        raise ValueError(f"{export_name} not found")
    return json.loads(json5_to_json(match.group(1)))


def parse_teambuilder_table(source):
    prefix = "exports.BattleTeambuilderTable = JSON.parse('"
    suffix = "');"
    start = source.find(prefix)
    end = source.rfind(suffix)
    if start < 0 or end < 0 or end <= start:
        raise ValueError("BattleTeambuilderTable not found")
    raw_payload = source[start + len(prefix):end]
    normalized_payload = raw_payload.replace("\\'", "'")
    return json.loads(normalized_payload)


def select_champions_vgc_format(formats):
    candidates = [
        entry for entry in formats
        if isinstance(entry, dict)
        and entry.get("gameType") == "doubles"
        and CHAMPIONS_VGC_NAME_PATTERN.match(entry.get("name", ""))
        and "(Bo3)" not in entry.get("name", "")
    ]
    preferred = [entry for entry in candidates if entry.get("bestOfDefault")]
    if len(preferred) == 1:
        return preferred[0]
    if len(candidates) == 1:
        return candidates[0]
    names = [entry.get("name", "<unknown>") for entry in candidates]
    raise ValueError(f"Unable to determine Champions VGC format uniquely: {names}")


def write_formats_data():
    print("Updating formats.")
    formats = parse_exported_array(fetch_text(FORMATS_SOURCE), "Formats")
    (STATS_DIR / "formats.json").write_text(
        json.dumps(formats, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return formats


def write_learnsets_data():
    print("Updating learnsets.")
    learnsets = parse_exported_object(fetch_text(LEARNSETS_SOURCE), "BattleLearnsets")
    (STATS_DIR / "learnsets.json").write_text(
        json.dumps(learnsets, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def get_usable_tier_window(champions_table, active_format):
    format_slices = champions_table.get("formatSlices", {})
    has_restricted = bool(active_format.get("restricted")) or any(
        "Restricted" in rule for rule in active_format.get("ruleset", [])
    )
    start_key = "Uber" if has_restricted else "OU"
    start_index = int(format_slices.get(start_key, 0))
    end_index = int(format_slices.get("NFE", len(champions_table.get("tiers", []))))
    if end_index <= start_index:
        raise ValueError(f"Invalid Champions tier window: {start_key} {start_index} -> NFE {end_index}")
    return start_key, start_index, end_index


def collect_usable_species_ids(champions_table, active_format):
    start_key, start_index, end_index = get_usable_tier_window(champions_table, active_format)
    override_tier = champions_table.get("overrideTier", {})
    usable_species_ids = []
    seen = set()
    for entry in champions_table.get("tiers", [])[start_index:end_index]:
        if not isinstance(entry, str):
            continue
        if override_tier.get(entry) == "Illegal":
            continue
        if entry in seen:
            continue
        usable_species_ids.append(entry)
        seen.add(entry)
    return {
        "sliceStartTier": start_key,
        "sliceStartIndex": start_index,
        "sliceEndIndex": end_index,
        "usableSpeciesIds": usable_species_ids,
    }


def is_mega_entry(entry):
    return str(entry.get("forme", "")).startswith("Mega") or "-Mega" in str(entry.get("name", ""))


def is_legal_champions_item(item):
    if not isinstance(item, dict):
        return False
    is_nonstandard = item.get("isNonstandard")
    return is_nonstandard in (None, "")


def expand_usable_species_ids_with_mega_forms(pokedex, items, usable_species_ids):
    expanded = []
    seen = set()
    for species_id in usable_species_ids:
        entry = pokedex.get(species_id, {})
        if is_mega_entry(entry) and not is_legal_champions_item(
            items.get(normalize_species_id(entry.get("requiredItem")))
        ):
            continue
        if species_id in seen:
            continue
        expanded.append(species_id)
        seen.add(species_id)

    usable_base_ids = {normalize_species_id(species_id) for species_id in expanded}
    mega_species_ids = [
        species_id for species_id, entry in pokedex.items()
        if is_mega_entry(entry)
        and normalize_species_id(entry.get("baseSpecies")) in usable_base_ids
        and is_legal_champions_item(items.get(normalize_species_id(entry.get("requiredItem"))))
        and species_id not in seen
    ]

    for species_id in mega_species_ids:
        expanded.append(species_id)
        seen.add(species_id)

    return expanded


def write_text_source(url, destination, label):
    print(f"Updating {label}.")
    content = fetch_text(url)
    if destination.name in {"items.json", "abilities.json"}:
        content = "{" + content.split("{", 1)[1][:-1]
    destination.write_text(content, encoding="utf-8")


def write_binary_source(url, destination, label):
    print(f"Updating {label}.")
    response = requests.get(url, stream=True, timeout=60)
    response.raise_for_status()
    with destination.open("wb") as file_obj:
        for chunk in response.iter_content(chunk_size=8192):
            file_obj.write(chunk)


def extract_forms_index():
    print("Updating forms index.")
    content = fetch_text(FORMS_SOURCE)
    match = re.search(r"BattlePokemonIconIndexes\s*=\s*\{(.*?)\n\};", content, re.DOTALL)
    if not match:
        raise ValueError("BattlePokemonIconIndexes not found in battle-dex-data.js")

    raw_body = match.group(1).replace("\t", " ")

    entries = []
    for part in raw_body.split(","):
        item = part.strip()
        if not item:
            continue
        key, value = item.split(":", 1)
        key = key.strip().strip('"').strip("'")
        value = value.strip()
        if "+" in value:
            left, right = value.split("+", 1)
            value = str(int(left.strip()) + int(right.strip()))
        entries.append((key, int(value)))

    forms_index = {key: value for key, value in entries}
    (STATS_DIR / "forms_index.json").write_text(
        json.dumps(forms_index, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def write_champions_vgc_data():
    print("Updating Champions VGC metadata.")
    formats = write_formats_data()
    teambuilder = parse_teambuilder_table(fetch_text(TEAMBUILDER_SOURCE))
    base_items = load_json5_object(STATS_DIR / "items.json")
    base_pokedex = json.loads((STATS_DIR / "pokedex.json").read_text(encoding="utf-8"))
    champions = teambuilder.get("champions")
    if not isinstance(champions, dict):
        raise ValueError("Champions table not found in teambuilder data")

    active_format = select_champions_vgc_format(formats)
    usable_species = collect_usable_species_ids(champions, active_format)
    merged_items = {
        **base_items,
        **enrich_champions_item_overrides(base_items, champions.get("overrideItemData", {})),
    }
    expanded_usable_species_ids = expand_usable_species_ids_with_mega_forms(
        base_pokedex,
        merged_items,
        usable_species["usableSpeciesIds"],
    )
    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "format": {
            "name": active_format.get("name"),
            "mod": active_format.get("mod"),
            "gameType": active_format.get("gameType"),
            "ruleset": active_format.get("ruleset", []),
            "restricted": active_format.get("restricted", []),
            "banlist": active_format.get("banlist", []),
        },
        "usableSpeciesIds": expanded_usable_species_ids,
        "selectionWindow": {
            "sliceStartTier": usable_species["sliceStartTier"],
            "sliceStartIndex": usable_species["sliceStartIndex"],
            "sliceEndIndex": usable_species["sliceEndIndex"],
        },
        "learnsets": champions.get("learnsets", {}),
        "overrideSpeciesData": champions.get("overrideSpeciesData", {}),
        "overrideMoveData": champions.get("overrideMoveData", {}),
        "overrideAbilityData": champions.get("overrideAbilityData", {}),
        "overrideItemData": enrich_champions_item_overrides(base_items, champions.get("overrideItemData", {})),
    }
    (STATS_DIR / "champions_vgc.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def update_usage_data():
    print("Checking Smogon Champions VGC usage.")
    recent_usage = find_recent_champions_usage_url()
    if not recent_usage:
        if not STATIC_USAGE_PATH.exists():
            raise FileNotFoundError(
                "No recent Smogon Champions VGC usage file was found and static/usage.json does not exist."
            )
        print("No recent Smogon Champions VGC usage file found. Keeping existing static/usage.json.")
        return

    month, usage_url = recent_usage
    print(f"Downloading Champions VGC usage from {month}: {usage_url}")
    payload = json.loads(fetch_text(usage_url))
    STATIC_USAGE_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def main():
    print("Starting core data update...")
    ensure_directories()
    prune_usage_files()

    for source in TEXT_SOURCES:
        write_text_source(*source)

    extract_forms_index()
    write_learnsets_data()
    write_champions_vgc_data()
    update_usage_data()

    for source in BINARY_SOURCES:
        write_binary_source(*source)

    print("Core data update completed.")


if __name__ == "__main__":
    main()
