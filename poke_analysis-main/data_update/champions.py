import json
import re
from datetime import datetime, timezone

from .io import fetch_text, load_json5_object, write_json
from .paths import CHAMPIONS_VGC_PATH, STATS_DIR, TEAMBUILDER_SOURCE
from .showdown_sources import write_formats_data

CHAMPIONS_VGC_NAME_PATTERN = re.compile(r"^\[Gen \d+ Champions\] VGC\b")
TARGET_REGULATION_PATTERN = re.compile(r"\bReg(?:ulation)?\s+M-B\b", re.IGNORECASE)



def normalize_showdown_id(value):
    return re.sub(r"[^a-z0-9]+", "", str(value or "").lower())


def parse_teambuilder_table(source):
    prefix = "exports.BattleTeambuilderTable = JSON.parse('"
    suffix = "');"
    start = source.find(prefix)
    end = source.rfind(suffix)
    if start < 0 or end < 0 or end <= start:
        raise ValueError("BattleTeambuilderTable not found")
    raw_payload = source[start + len(prefix):end]
    return json.loads(raw_payload.replace("\\'", "'"))


def select_champions_vgc_format(formats):
    candidates = [
        entry for entry in formats
        if is_champions_vgc_format(entry)
        and "(Bo3)" not in entry.get("name", "")
        and TARGET_REGULATION_PATTERN.search(entry.get("name", ""))
    ]
    preferred = [entry for entry in candidates if entry.get("bestOfDefault")]
    if len(preferred) == 1:
        return preferred[0]
    if len(candidates) == 1:
        return candidates[0]
    names = [entry.get("name", "<unknown>") for entry in formats if is_champions_vgc_format(entry)]
    raise ValueError(f"Unable to determine Champions VGC Reg M-B format uniquely: {names}")


def is_champions_vgc_format(entry):
    return (
        isinstance(entry, dict)
        and entry.get("gameType") == "doubles"
        and CHAMPIONS_VGC_NAME_PATTERN.match(entry.get("name", ""))
    )


def write_champions_vgc_data():
    print("Updating Champions VGC metadata.")
    formats = write_formats_data()
    teambuilder = parse_teambuilder_table(fetch_text(TEAMBUILDER_SOURCE))
    champions = teambuilder.get("champions")
    if not isinstance(champions, dict):
        raise ValueError("Champions table not found in teambuilder data")
    active_format = select_champions_vgc_format(formats)
    payload = build_champions_payload(champions, active_format)
    write_json(CHAMPIONS_VGC_PATH, payload)
    return payload


def build_champions_payload(champions, active_format):
    base_items = load_json5_object(STATS_DIR / "items.json")
    base_pokedex = json.loads((STATS_DIR / "pokedex.json").read_text(encoding="utf-8"))
    usable_species = collect_usable_species_ids(champions, active_format)
    item_overrides = enrich_champions_item_overrides(base_items, champions.get("overrideItemData", {}))
    merged_items = {**base_items, **item_overrides}
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "format": format_metadata(active_format),
        "usage": {"expectedMetagame": normalize_showdown_id(active_format.get("name"))},
        "usableSpeciesIds": expand_usable_species_ids_with_mega_forms(
            base_pokedex,
            merged_items,
            usable_species["usableSpeciesIds"],
        ),
        "selectionWindow": {
            "sliceStartTier": usable_species["sliceStartTier"],
            "sliceStartIndex": usable_species["sliceStartIndex"],
            "sliceEndIndex": usable_species["sliceEndIndex"],
        },
        "learnsets": champions.get("learnsets", {}),
        "overrideSpeciesData": champions.get("overrideSpeciesData", {}),
        "overrideMoveData": champions.get("overrideMoveData", {}),
        "overrideAbilityData": champions.get("overrideAbilityData", {}),
        "overrideItemData": item_overrides,
    }


def format_metadata(active_format):
    return {
        "name": active_format.get("name"),
        "mod": active_format.get("mod"),
        "gameType": active_format.get("gameType"),
        "ruleset": active_format.get("ruleset", []),
        "restricted": active_format.get("restricted", []),
        "banlist": active_format.get("banlist", []),
    }


def get_usable_tier_window(champions_table, active_format):
    format_slices = champions_table.get("formatSlices", {})
    start_key = "Uber"
    start_index = int(format_slices.get(start_key, 0))
    end_index = int(format_slices.get("NFE", len(champions_table.get("tiers", []))))
    if end_index <= start_index:
        raise ValueError(f"Invalid Champions tier window: {start_key} {start_index} -> NFE {end_index}")
    return start_key, start_index, end_index


def collect_usable_species_ids(champions_table, active_format):
    start_key, start_index, end_index = get_usable_tier_window(champions_table, active_format)
    override_tier = champions_table.get("overrideTier", {})
    species_ids = unique_legal_tier_entries(champions_table, override_tier, start_index, end_index)
    return {
        "sliceStartTier": start_key,
        "sliceStartIndex": start_index,
        "sliceEndIndex": end_index,
        "usableSpeciesIds": species_ids,
    }


def unique_legal_tier_entries(champions_table, override_tier, start_index, end_index):
    usable_species_ids = []
    seen = set()
    for entry in champions_table.get("tiers", [])[start_index:end_index]:
        if not isinstance(entry, str) or override_tier.get(entry) == "Illegal" or entry in seen:
            continue
        usable_species_ids.append(entry)
        seen.add(entry)
    return usable_species_ids


def is_mega_entry(entry):
    return str(entry.get("forme", "")).startswith("Mega") or "-Mega" in str(entry.get("name", ""))
BATTLE_STAT_KEYS = ("hp", "atk", "def", "spa", "spd", "spe")


def _get_ability_set(entry):
    return tuple(sorted(entry.get("abilities", {}).values()))


def is_battle_equivalent_form(entry, base_entry):
    if not entry.get("baseSpecies"):
        return False
    if is_mega_entry(entry):
        return False
    if entry.get("requiredItem") or entry.get("requiredMove") or entry.get("battleOnly") or entry.get("changesFrom"):
        return False
    return (
        entry.get("types") == base_entry.get("types")
        and all(
            entry.get("baseStats", {}).get(stat) == base_entry.get("baseStats", {}).get(stat)
            for stat in BATTLE_STAT_KEYS
        )
        and _get_ability_set(entry) == _get_ability_set(base_entry)
    )


def is_selectable_battle_species(pokedex, species_id):
    entry = pokedex.get(species_id)
    if not entry or not entry.get("name") or not entry.get("baseStats"):
        return False
    if entry.get("battleOnly") and not is_mega_entry(entry):
        return False
    base_species_id = normalize_showdown_id(entry.get("baseSpecies", ""))
    base_entry = pokedex.get(base_species_id) if base_species_id else None
    return not base_entry or not is_battle_equivalent_form(entry, base_entry)


def is_legal_champions_item(item):
    if not isinstance(item, dict):
        return False
    return item.get("isNonstandard") in (None, "")


def expand_usable_species_ids_with_mega_forms(pokedex, items, usable_species_ids):
    expanded = filter_legal_listed_megas(pokedex, items, usable_species_ids)
    seen = set(expanded)
    for species_id in legal_mega_forms_for_base_species(pokedex, items, expanded, seen):
        expanded.append(species_id)
        seen.add(species_id)
    return [
        species_id for species_id in expanded
        if is_selectable_battle_species(pokedex, species_id)
    ]


def filter_legal_listed_megas(pokedex, items, usable_species_ids):
    expanded = []
    seen = set()
    for species_id in usable_species_ids:
        if not is_selectable_battle_species(pokedex, species_id):
            continue
        entry = pokedex.get(species_id, {})
        required = items.get(normalize_showdown_id(entry.get("requiredItem")))
        if is_mega_entry(entry) and not is_legal_champions_item(required):
            continue
        if species_id not in seen:
            expanded.append(species_id)
            seen.add(species_id)
    return expanded


def legal_mega_forms_for_base_species(pokedex, items, usable_species_ids, seen):
    usable_base_ids = {normalize_showdown_id(species_id) for species_id in usable_species_ids}
    return [
        species_id for species_id, entry in pokedex.items()
        if is_mega_entry(entry)
        and normalize_showdown_id(entry.get("baseSpecies")) in usable_base_ids
        and is_legal_champions_item(items.get(normalize_showdown_id(entry.get("requiredItem"))))
        and species_id not in seen
    ]


def enrich_champions_item_overrides(base_items, override_items):
    return {
        item_id: enrich_item_override(base_items, item_id, patch)
        for item_id, patch in override_items.items()
    }


def enrich_item_override(base_items, item_id, patch):
    merged = {**base_items.get(item_id, {}), **patch}
    next_patch = dict(patch)
    if merged.get("desc") or merged.get("shortDesc") or not merged.get("megaStone"):
        return next_patch
    user_label = format_name_list(merged.get("itemUser") or list((merged.get("megaStone") or {}).keys()))
    if not user_label:
        return next_patch
    description = f"If held by {user_label}, this item allows it to Mega Evolve in battle."
    return {**next_patch, "desc": description, "shortDesc": description}


def format_name_list(names):
    cleaned_names = [str(name).strip() for name in names if str(name).strip()]
    if len(cleaned_names) <= 2:
        return " or ".join(cleaned_names)
    return f"{', '.join(cleaned_names[:-1])}, or {cleaned_names[-1]}"
