import json
import re
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STATS_DIR = ROOT / "poke_analysis-main" / "stats"
STATIC_DIR = ROOT / "static"

POKEDEX_PATH = STATS_DIR / "pokedex.json"
ITEMS_PATH = STATS_DIR / "items.json"
ABILITIES_PATH = STATS_DIR / "abilities.json"
MOVES_PATH = STATS_DIR / "moves.json"
CHAMPIONS_VGC_PATH = STATS_DIR / "champions_vgc.json"
USAGE_OFFICIAL_PATH = STATIC_DIR / "usage_official.json"
USAGE_PATH = STATIC_DIR / "usage.json"
OUTPUT_PATH = ROOT / "config-default.txt"
PASTE_SETS_PATH = STATIC_DIR / "paste_sets_champions_ma.json"
VGCPASTES_CSV_PATH = STATIC_DIR / "VGCPastes Repository - Champions M-A.csv"

DEFAULT_SEASON = "M-1"
DEFAULT_FORMAT = "double"
LEVEL = 50
STAT_KEYS = ("hp", "atk", "def", "spa", "spd", "spe")
STAT_LABELS = {"hp": "HP", "atk": "Atk", "def": "Def", "spa": "SpA", "spd": "SpD", "spe": "Spe"}


@dataclass(frozen=True)
class LocalDatasets:
    pokedex: dict
    items: dict
    abilities: dict
    moves: dict
    champions: dict
    pokedex_lookup: dict
    item_lookup: dict
    ability_lookup: dict
    move_lookup: dict
    mega_stone_lookup: dict


def normalize_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", str(value or "").lower())


def json5_to_json(text: str) -> str:
    return re.sub(r"([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)(\s*:)", r'\1"\2"\3', text)


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def load_json5_object(path: Path) -> dict:
    return json.loads(json5_to_json(path.read_text(encoding="utf-8")))


def _register_lookup(out: dict, key: str, value):
    normalized = normalize_name(key)
    if normalized and normalized not in out:
        out[normalized] = value


def build_named_lookup(data: dict) -> dict:
    out = {}
    for key, entry in data.items():
        if not isinstance(entry, dict):
            continue
        name = entry.get("name")
        if not name:
            continue
        _register_lookup(out, key, name)
        _register_lookup(out, name, name)
    return out


def build_pokedex_lookup(pokedex: dict) -> dict:
    out = {}
    for key, entry in pokedex.items():
        if not isinstance(entry, dict) or not entry.get("num"):
            continue
        record = {"id": key, "num": entry["num"], "name": entry.get("name") or key}
        aliases = {key, record["name"], record["name"].replace("-", " ")}
        aliases.update(_gender_aliases(record["name"]))
        for alias in aliases:
            _register_lookup(out, alias, record)
    return out


def _gender_aliases(name: str) -> set:
    aliases = set()
    if name.endswith("-F"):
        aliases.add(name[:-2] + " Female")
        aliases.add(name[:-2] + " F")
    if name.endswith("-M"):
        aliases.add(name[:-2] + " Male")
        aliases.add(name[:-2] + " M")
    return aliases


def resolve_pokemon(display_name: str, pokedex_lookup: dict):
    normalized = normalize_name(display_name)
    if normalized in pokedex_lookup:
        return pokedex_lookup[normalized]
    stripped = re.sub(r"(female|male)$", "", normalized)
    return pokedex_lookup.get(stripped)


def build_mega_stone_lookup(items: dict) -> dict:
    out = {}
    for key, entry in items.items():
        if not isinstance(entry, dict) or not entry.get("megaStone"):
            continue
        base, mega = next(iter(entry["megaStone"].items()))
        record = {"mega_species": mega, "base": base}
        _register_lookup(out, key, record)
        _register_lookup(out, entry.get("name"), record)
    return out


def merge_overrides(base: dict, overrides: dict) -> dict:
    merged = dict(base)
    for key, value in (overrides or {}).items():
        if isinstance(value, dict):
            merged[key] = {**base.get(key, {}), **value}
        else:
            merged[key] = value
    return merged


def load_local_datasets() -> LocalDatasets:
    pokedex = load_json(POKEDEX_PATH)
    items = load_json5_object(ITEMS_PATH)
    abilities = load_json5_object(ABILITIES_PATH)
    moves = load_json(MOVES_PATH)
    champions = load_json(CHAMPIONS_VGC_PATH)
    pokedex = merge_overrides(pokedex, champions.get("overrideSpeciesData"))
    items = merge_overrides(items, champions.get("overrideItemData"))
    abilities = merge_overrides(abilities, champions.get("overrideAbilityData"))
    moves = merge_overrides(moves, champions.get("overrideMoveData"))
    return LocalDatasets(
        pokedex=pokedex,
        items=items,
        abilities=abilities,
        moves=moves,
        champions=champions,
        pokedex_lookup=build_pokedex_lookup(pokedex),
        item_lookup=build_named_lookup(items),
        ability_lookup=build_named_lookup(abilities),
        move_lookup=build_named_lookup(moves),
        mega_stone_lookup=build_mega_stone_lookup(items),
    )


def top_lookup_name(name: str, lookup: dict) -> str:
    return lookup.get(normalize_name(name), "")


def species_ability(species_name: str, pokedex: dict) -> str:
    entry = pokedex.get(normalize_name(species_name))
    abilities = entry.get("abilities", {}) if entry else {}
    return abilities.get("0") or abilities.get("H") or next(iter(abilities.values()), "")


def format_preset_block(config: dict) -> str:
    species = config["species"]
    item = config.get("item", "")
    lines = [f"{species} @ {item}" if item else species]
    if config.get("ability"):
        lines.append(f"Ability: {config['ability']}")
    lines.append(f"Level: {LEVEL}")
    if config.get("note"):
        lines.append(f"Note: {config['note']}")
    lines.append(format_points(config["points"]))
    lines.append(f"{config['nature']} Nature")
    lines.extend(f"- {move}" for move in config["moves"][:4])
    return "\n".join(lines)


def format_points(points: dict) -> str:
    parts = [f"{int(points.get(key, 0))} {STAT_LABELS[key]}" for key in STAT_KEYS]
    return "Points: " + " / ".join(parts)
