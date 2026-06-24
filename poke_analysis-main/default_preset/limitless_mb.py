import csv
import json
import re
import shutil
from datetime import datetime, timezone

from .common import normalize_name, format_preset_block
from .name_resolution import maybe_mega_species, resolve_ability, resolve_item, resolve_move, resolve_species
from .vgcpastes import (
    CHAMPION_TOTAL_POINTS,
    PASTE_SETS_PATH,
    PASTE_TEAMS_PATH,
    POKEMON_COUNT,
    STAT_KEYS,
    STAT_MAP,
    build_paste_sets_payload,
    build_paste_teams,
    build_paste_teams_payload,
    select_common_configs,
)
from data_update.paths import LIMITLESS_MB_SOURCE_PATH, LIMITLESS_MB_STATIC_PATH

SHOWDOWN_TEAM_COL = "Showdown Team"
DEFAULT_SOURCE_LABEL = "Limitless VGC M-B"
PHYSICAL_CATEGORIES = {"Physical"}
SPECIAL_CATEGORIES = {"Special"}
PHYSICAL_NATURES = {"Adamant", "Brave", "Impish", "Jolly", "Careful"}
SPECIAL_NATURES = {"Modest", "Quiet", "Bold", "Timid", "Calm"}
DEFENSIVE_NATURES = {"Bold", "Impish", "Relaxed", "Lax"}
SPECIAL_DEFENSIVE_NATURES = {"Calm", "Careful", "Sassy", "Gentle"}
SPEED_NATURES = {"Jolly", "Timid", "Naive", "Hasty"}
ITEM_ALIASES = {
    "nothing": "",
    "noitem": "",
    "none": "",
}
MOVE_ALIASES = {
    "lifedrew": "Life Dew",
}



def build_limitless_mb_preset(datasets, usage_data: dict, limit=0, strict=False):
    sync_source_csv()
    rows = parse_limitless_rows(limit)
    configs = []
    errors = []
    for row_index, row in enumerate(rows, start=1):
        try:
            configs.extend(parse_limitless_team(row, row_index, datasets))
        except Exception as error:
            errors.append(f"row {row_index} {row.get('Source', '')}: {error}")
    if errors and strict:
        raise RuntimeError("Limitless M-B import failed:\n" + "\n".join(errors[:30]))
    if errors:
        print("Skipped invalid Limitless M-B rows:")
        for error in errors[:30]:
            print(f"  {error}")
    selected = select_common_configs(configs, datasets, usage_data)
    payload = build_paste_sets_payload(configs, selected, errors)
    payload["info"] = {
        **payload["info"],
        "source": str(LIMITLESS_MB_STATIC_PATH.name),
        "sourceKind": "limitless-vgc-mb",
        "parsedTeamCount": len(rows),
    }
    PASTE_SETS_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    teams = build_paste_teams(configs)
    teams_payload = build_paste_teams_payload(teams)
    teams_payload["info"] = {
        **teams_payload["info"],
        "source": str(LIMITLESS_MB_STATIC_PATH.name),
        "sourceKind": "limitless-vgc-mb",
    }
    PASTE_TEAMS_PATH.write_text(json.dumps(teams_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    text = "\n\n".join(format_preset_block(config) for config in selected) + "\n"
    return text, len(selected), payload


def sync_source_csv():
    if not LIMITLESS_MB_SOURCE_PATH.exists():
        raise FileNotFoundError(f"Limitless M-B CSV not found: {LIMITLESS_MB_SOURCE_PATH}")
    LIMITLESS_MB_STATIC_PATH.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(LIMITLESS_MB_SOURCE_PATH, LIMITLESS_MB_STATIC_PATH)


def parse_limitless_rows(limit=0):
    rows = []
    with LIMITLESS_MB_STATIC_PATH.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            if not (row.get(SHOWDOWN_TEAM_COL) or "").strip():
                continue
            rows.append(row)
            if limit and len(rows) >= limit:
                break
    return rows


def parse_limitless_team(row, row_index, datasets):
    blocks = [block.strip() for block in re.split(r"\n\s*\n", row[SHOWDOWN_TEAM_COL].replace("\r", "")) if block.strip()]
    configs = []
    for slot, block in enumerate(blocks, start=1):
        configs.append(parse_limitless_block(block, row, row_index, slot, datasets))
    if len(configs) != POKEMON_COUNT:
        raise ValueError(f"expected {POKEMON_COUNT} configs, got {len(configs)}")
    return configs


def parse_limitless_block(block, row, row_index, slot, datasets):
    lines = [line.strip() for line in block.split("\n") if line.strip()]
    species_label, item_label = parse_header(lines[0])
    species = resolve_species(species_label, datasets)
    item = resolve_limitless_item(item_label, datasets, base_species_name(species, datasets))
    output_species = maybe_mega_species(species["name"], item, datasets)
    ability = parse_prefixed(lines, "Ability")
    nature = parse_nature(lines) or infer_nature(lines, datasets)
    moves = parse_moves(lines, datasets)
    if not ability or not moves:
        raise ValueError(f"row {row_index} slot {slot} missing ability or moves")
    points = parse_points(lines)
    if not points:
        points = infer_points(nature, moves, datasets)
    output_ability = resolve_output_ability(output_species, ability, datasets)
    team_id = f"LM{row_index:04d}"
    return {
        "species": output_species,
        "speciesId": normalize_name(output_species),
        "item": item,
        "ability": output_ability,
        "nature": nature,
        "points": points,
        "moves": moves,
        "score": 0,
        "note": f"Limitless M-B {team_id}",
        "source": {
            "teamId": team_id,
            "url": row.get("Source", ""),
            "slot": slot,
            "dateShared": row.get("Date", ""),
            "description": row.get("Tournament", ""),
            "owner": row.get("Player", ""),
            "record": row.get("Record", ""),
            "rank": row.get("Rank", ""),
            "sourceKind": "limitless-vgc-mb",
        },
    }


def parse_header(line):
    left, separator, item = line.partition("@")
    species = re.sub(r"\s+\((M|F)\)$", "", left.strip())
    return species, item.strip() if separator else ""


def resolve_limitless_item(item_label, datasets, species_name):
    normalized = normalize_name(item_label)
    if normalized in ITEM_ALIASES:
        return ITEM_ALIASES[normalized]
    return resolve_item(item_label, datasets, species_name).name

def base_species_name(species, datasets):
    entry = datasets.pokedex.get(species["id"], {})
    return entry.get("baseSpecies") or species["name"]


def parse_prefixed(lines, label):
    prefix = f"{label}:"
    return next((line[len(prefix):].strip() for line in lines if line.startswith(prefix)), "")


def parse_nature(lines):
    return next((line.replace(" Nature", "").strip() for line in lines if line.endswith(" Nature")), "")


def parse_moves(lines, datasets):
    return [resolve_move(MOVE_ALIASES.get(normalize_name(line[2:].strip()), line[2:].strip()), datasets).name for line in lines if line.startswith("- ")]


def parse_points(lines):
    points_line = next((line for line in lines if line.startswith("Points:")), "")
    if points_line:
        return normalize_points(parse_stat_values(points_line, "Points:"))
    ev_line = next((line for line in lines if line.startswith("EVs:")), "")
    if ev_line:
        return normalize_points(parse_stat_values(ev_line, "EVs:"))
    return {}


def parse_stat_values(line, prefix):
    values = {key: 0 for key in STAT_KEYS}
    for part in line[len(prefix):].split("/"):
        match = re.match(r"\s*(\d+)\s+([A-Za-z]+)\s*$", part)
        if match and match.group(2) in STAT_MAP:
            values[STAT_MAP[match.group(2)]] = int(match.group(1))
    return values


def normalize_points(values):
    total = sum(int(values.get(key, 0)) for key in STAT_KEYS)
    if total in {508, 510} or total > CHAMPION_TOTAL_POINTS:
        values = {key: min(32, max(0, (int(values.get(key, 0)) + 4) // 8)) for key in STAT_KEYS}
    return clamp_total(values)


def clamp_total(values):
    out = {key: min(32, max(0, int(values.get(key, 0)))) for key in STAT_KEYS}
    total = sum(out.values())
    for key in ("hp", "atk", "def", "spa", "spd", "spe"):
        if total <= CHAMPION_TOTAL_POINTS:
            break
        drop = min(out[key], total - CHAMPION_TOTAL_POINTS)
        out[key] -= drop
        total -= drop
    return out


def infer_nature(lines, datasets):
    moves = parse_moves(lines, datasets)
    physical, special = move_bias(moves, datasets)
    return "Adamant" if physical >= special else "Modest"


def infer_points(nature, moves, datasets):
    physical, special = move_bias(moves, datasets)
    if nature in DEFENSIVE_NATURES:
        return {"hp": 32, "atk": 0, "def": 32, "spa": 0, "spd": 0, "spe": 2}
    if nature in SPECIAL_DEFENSIVE_NATURES:
        return {"hp": 32, "atk": 0, "def": 0, "spa": 0, "spd": 32, "spe": 2}
    if special > physical or nature in SPECIAL_NATURES:
        speed = 32 if nature in SPEED_NATURES or physical + special > 0 else 2
        hp = CHAMPION_TOTAL_POINTS - 32 - speed
        return {"hp": hp, "atk": 0, "def": 0, "spa": 32, "spd": 0, "spe": speed}
    speed = 32 if nature in SPEED_NATURES or physical + special > 0 else 2
    hp = CHAMPION_TOTAL_POINTS - 32 - speed
    return {"hp": hp, "atk": 32, "def": 0, "spa": 0, "spd": 0, "spe": speed}


def move_bias(moves, datasets):
    physical = 0
    special = 0
    for move_name in moves:
        move = datasets.moves.get(normalize_name(move_name), {})
        category = move.get("category")
        if category in PHYSICAL_CATEGORIES:
            physical += 1
        elif category in SPECIAL_CATEGORIES:
            special += 1
    return physical, special


def resolve_output_ability(species_name, raw_ability, datasets):
    if "-Mega" in species_name:
        species = resolve_species(species_name, datasets)
        abilities = species.get("abilities") or {}
        return abilities.get("0") or abilities.get("H") or next(iter(abilities.values()), raw_ability)
    return resolve_ability(raw_ability, datasets).name
