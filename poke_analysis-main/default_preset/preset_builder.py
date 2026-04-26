from dataclasses import dataclass

from .common import format_preset_block, normalize_name, species_ability, top_lookup_name
from .name_resolution import resolve_ability, resolve_item

MIN_PRIMARY_PERCENT = 10.0
MIN_SPREAD_PERCENT = 5.0
RELATIVE_VARIANT_FLOOR = 0.25
MAX_ITEMS = 3
MAX_ABILITIES = 2
MAX_NATURES = 3
MAX_SPREADS = 4
MAX_MOVESETS = 3
MAX_PRESETS_PER_SPECIES = 3
MOVESET_SIZE = 4

@dataclass(frozen=True)
class Option:
    name: str
    percent: float
    payload: object = None


def build_default_preset(usage_official: dict, datasets):
    blocks = []
    skipped = []
    for species, profile in _ranked_profiles(usage_official):
        configs = build_species_configs(species, profile, datasets)
        if not configs:
            skipped.append(species)
            continue
        blocks.extend(format_preset_block(config) for config in configs)
    if skipped:
        print(f"Skipped {len(skipped)} species without enough official data: {', '.join(skipped[:12])}")
    return "\n\n".join(blocks) + "\n", len(blocks)


def build_species_configs(species: str, profile: dict, datasets) -> list:
    official = profile.get("usageOfficial") or {}
    items = _item_options(species, official.get("items", []), datasets, MAX_ITEMS)
    abilities = _ability_options(species, official.get("abilities", []), datasets)
    natures = _raw_options(official.get("natures", []), MAX_NATURES)
    spreads = _spread_options(official.get("spreads", []), MAX_SPREADS)
    movesets = _move_options(official.get("moves", []), datasets.move_lookup)
    if not abilities or not natures or not spreads or not movesets:
        return []
    return _top_configs(species, items, abilities, natures, spreads, movesets, datasets)


def _ranked_profiles(usage_official: dict):
    data = usage_official.get("data", {})
    return sorted(data.items(), key=lambda item: int(item[1].get("rank") or 9999))


def _named_options(entries: list, lookup: dict, limit: int) -> list:
    raw = _raw_options(entries, limit)
    resolved = []
    seen = set()
    for option in raw:
        name = _resolve_name(option.name, lookup)
        key = normalize_name(name)
        if not name or key in seen:
            continue
        seen.add(key)
        resolved.append(Option(name=name, percent=option.percent))
    return resolved


def _item_options(species: str, entries: list, datasets, limit: int) -> list:
    raw = _raw_options(entries, limit)
    resolved = []
    seen = set()
    for option in raw:
        name = resolve_item(option.name, datasets, species).name
        key = normalize_name(name)
        if key in seen:
            continue
        seen.add(key)
        resolved.append(Option(name=name, percent=option.percent))
    return resolved


def _ability_options(species: str, entries: list, datasets) -> list:
    raw = _raw_options(entries, MAX_ABILITIES)
    resolved = []
    seen = set()
    for option in raw:
        name = resolve_ability(option.name, datasets).name
        key = normalize_name(name)
        if key in seen:
            continue
        seen.add(key)
        resolved.append(Option(name=name, percent=option.percent))
    return resolved


def _raw_options(entries: list, limit: int) -> list:
    if not entries:
        return []
    top = max(float(entry.get("percent", 0)) for entry in entries)
    floor = max(MIN_PRIMARY_PERCENT, top * RELATIVE_VARIANT_FLOOR)
    options = [
        Option(name=entry["name"], percent=float(entry["percent"]))
        for entry in entries
        if float(entry.get("percent", 0)) >= floor
    ]
    return sorted(options, key=lambda item: -item.percent)[:limit]


def _spread_options(entries: list, limit: int) -> list:
    if not entries:
        return []
    top = max(float(entry.get("percent", 0)) for entry in entries)
    floor = max(MIN_SPREAD_PERCENT, top * RELATIVE_VARIANT_FLOOR)
    options = [
        Option(name="spread", percent=float(entry["percent"]), payload=entry["points"])
        for entry in entries
        if float(entry.get("percent", 0)) >= floor
    ]
    if not options:
        options = [Option(name="spread", percent=float(entries[0]["percent"]), payload=entries[0]["points"])]
    return sorted(options, key=lambda item: -item.percent)[:limit]


def _move_options(entries: list, lookup: dict) -> list:
    ranked = _named_options(entries, lookup, limit=10)
    if not ranked:
        return []
    moveset_size = min(MOVESET_SIZE, len(ranked))
    move_sets = [_moveset(ranked[:moveset_size])]
    for candidate in ranked[moveset_size:]:
        if len(move_sets) >= MAX_MOVESETS or candidate.percent < MIN_PRIMARY_PERCENT:
            break
        next_set = ranked[: moveset_size - 1] + [candidate]
        move_sets.append(_moveset(next_set))
    return move_sets


def _moveset(options: list) -> Option:
    names = [option.name for option in options]
    score = sum(option.percent for option in options) / len(options)
    return Option(name="moves", percent=score, payload=names)


def _resolve_name(name: str, lookup: dict) -> str:
    return top_lookup_name(name, lookup)


def _top_configs(species, items, abilities, natures, spreads, movesets, datasets):
    candidates = []
    item_options = items or [Option(name="", percent=100.0)]
    for item in item_options:
        for ability in abilities:
            for nature in natures:
                for spread in spreads:
                    for moveset in movesets:
                        candidates.append(_config(species, item, ability, nature, spread, moveset, datasets))
    return sorted(candidates, key=lambda item: -item["score"])[:MAX_PRESETS_PER_SPECIES]


def _config(species, item, ability, nature, spread, moveset, datasets):
    output_species = species
    output_ability = ability.name
    mega_info = datasets.mega_stone_lookup.get(normalize_name(item.name))
    if mega_info:
        output_species = mega_info["mega_species"]
        output_ability = species_ability(output_species, datasets.pokedex) or output_ability
    note = _note(item, ability, nature, spread, moveset)
    return {
        "species": output_species,
        "item": item.name,
        "ability": output_ability,
        "nature": nature.name,
        "points": spread.payload,
        "moves": moveset.payload,
        "score": _score(item, ability, nature, spread, moveset),
        "note": note,
    }


def _score(item, ability, nature, spread, moveset):
    item_score = item.percent if item.name else MIN_PRIMARY_PERCENT
    return item_score + ability.percent + nature.percent + spread.percent + moveset.percent


def _note(item, ability, nature, spread, moveset):
    parts = [
        f"item {item.percent:g}%" if item.name else "",
        f"ability {ability.percent:g}%",
        f"nature {nature.percent:g}%",
        f"spread {spread.percent:g}%",
        f"moves avg {moveset.percent:g}%",
    ]
    return "Official usage: " + ", ".join(part for part in parts if part)
