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


def json5_to_json(text):
    return re.sub(r'([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)(\s*:)', r'\1"\2"\3', text)


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
    champions = teambuilder.get("champions")
    if not isinstance(champions, dict):
        raise ValueError("Champions table not found in teambuilder data")

    active_format = select_champions_vgc_format(formats)
    usable_species = collect_usable_species_ids(champions, active_format)
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
        "usableSpeciesIds": usable_species["usableSpeciesIds"],
        "selectionWindow": {
            "sliceStartTier": usable_species["sliceStartTier"],
            "sliceStartIndex": usable_species["sliceStartIndex"],
            "sliceEndIndex": usable_species["sliceEndIndex"],
        },
        "learnsets": champions.get("learnsets", {}),
        "overrideSpeciesData": champions.get("overrideSpeciesData", {}),
        "overrideMoveData": champions.get("overrideMoveData", {}),
        "overrideAbilityData": champions.get("overrideAbilityData", {}),
        "overrideItemData": champions.get("overrideItemData", {}),
    }
    (STATS_DIR / "champions_vgc.json").write_text(
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

    for source in BINARY_SOURCES:
        write_binary_source(*source)

    print("Core data update completed.")


if __name__ == "__main__":
    main()
