import csv
import json
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone

import requests

from .common import (
    PASTE_SETS_PATH,
    ROOT,
    STAT_KEYS,
    VGCPASTES_CSV_PATH,
    format_preset_block,
    normalize_name,
    species_ability,
)
from .name_resolution import maybe_mega_species, resolve_ability, resolve_item, resolve_move, resolve_species
TEAM_ID_COL = 0
PASTE_URL_COL = 24
EVS_COL = 25
POKEMON_START_COL = 37
POKEMON_COUNT = 6
CACHE_PATH = ROOT / "poke_analysis-main" / "stats" / "pokepaste_cache.json"
REQUEST_TIMEOUT_SECONDS = 30
REQUEST_DELAY_SECONDS = 0.2
MAX_CONFIGS_PER_SPECIES = 3
CHAMPION_TOTAL_POINTS = 66
ITEM_SCORE_WEIGHT = 3
ABILITY_SCORE_WEIGHT = 2
MOVE_SCORE_WEIGHT = 1
STAT_MAP = {"HP": "hp", "Atk": "atk", "Def": "def", "SpA": "spa", "SpD": "spd", "Spe": "spe"}

@dataclass(frozen=True)
class PasteRow:
    team_id: str
    url: str
    species_names: tuple


class PokePasteClient:
    def __init__(self, refresh=False):
        self.refresh = refresh
        self.session = requests.Session()
        self.cache = self._load_cache()

    def fetch(self, url: str) -> str:
        raw_url = _raw_url(url)
        if not self.refresh and raw_url in self.cache:
            return self.cache[raw_url]["text"]
        response = self.session.get(raw_url, timeout=REQUEST_TIMEOUT_SECONDS)
        response.raise_for_status()
        text = response.text
        self.cache[raw_url] = {"text": text, "fetchedAt": datetime.now(timezone.utc).isoformat()}
        self.save_cache()
        time.sleep(REQUEST_DELAY_SECONDS)
        return text

    def save_cache(self):
        CACHE_PATH.write_text(json.dumps(self.cache, ensure_ascii=False, indent=2), encoding="utf-8")

    def _load_cache(self) -> dict:
        if self.refresh or not CACHE_PATH.exists():
            return {}
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))


def build_vgcpastes_preset(datasets, usage_data: dict, refresh=False, limit=0, strict=False):
    client = PokePasteClient(refresh=refresh)
    rows = parse_vgcpastes_rows(limit)
    configs = []
    errors = []
    for row in rows:
        try:
            text = client.fetch(row.url)
            configs.extend(parse_paste_configs(text, row, datasets))
        except Exception as error:
            errors.append(f"{row.team_id} {row.url}: {error}")
    client.save_cache()
    if errors and strict:
        raise RuntimeError("VGCPastes import failed:\n" + "\n".join(errors[:30]))
    if errors:
        print("Skipped invalid VGCPastes rows:")
        for error in errors[:30]:
            print(f"  {error}")
    selected = select_common_configs(configs, datasets, usage_data)
    payload = build_paste_sets_payload(configs, selected, errors)
    PASTE_SETS_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    text = "\n\n".join(format_preset_block(config) for config in selected) + "\n"
    return text, len(selected), payload


def parse_vgcpastes_rows(limit=0) -> list:
    rows = []
    with VGCPASTES_CSV_PATH.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.reader(handle)
        for row in reader:
            if not _is_data_row(row):
                continue
            if str(row[EVS_COL]).strip().lower() != "yes":
                continue
            paste_url = str(row[PASTE_URL_COL]).strip()
            if not paste_url:
                continue
            species = tuple(_row_species(row))
            rows.append(PasteRow(team_id=row[TEAM_ID_COL].strip(), url=paste_url, species_names=species))
            if limit and len(rows) >= limit:
                break
    return rows


def parse_paste_configs(text: str, row: PasteRow, datasets) -> list:
    blocks = [block.strip() for block in re.split(r"\n\s*\n", text.replace("\r", "")) if block.strip()]
    configs = []
    for index, block in enumerate(blocks, start=1):
        configs.append(parse_paste_block(block, row, index, datasets))
    if len(configs) != POKEMON_COUNT:
        raise ValueError(f"expected {POKEMON_COUNT} configs, got {len(configs)}")
    return configs


def parse_paste_block(block: str, row: PasteRow, index: int, datasets) -> dict:
    lines = [line.strip() for line in block.split("\n") if line.strip()]
    species_label, item_label = _parse_header(lines[0])
    species = resolve_species(species_label, datasets)
    item = resolve_item(item_label, datasets, _base_species_name(species, datasets)).name
    output_species = maybe_mega_species(species["name"], item, datasets)
    ability = _parse_prefixed(lines, "Ability")
    nature = _parse_nature(lines)
    points = _parse_points(lines)
    moves = _parse_moves(lines, datasets)
    if not ability or not nature or not moves:
        raise ValueError(f"{row.team_id} block {index} missing ability, nature, or moves")
    output_ability = _resolve_output_ability(output_species, ability, datasets)
    return {
        "species": output_species,
        "speciesId": normalize_name(output_species),
        "item": item,
        "ability": output_ability,
        "nature": nature,
        "points": points,
        "moves": moves,
        "score": 0,
        "note": f"VGCPastes {row.team_id}",
        "source": {"teamId": row.team_id, "url": row.url, "slot": index},
    }

def select_common_configs(configs: list, datasets, usage_data: dict) -> list:
    grouped = {}
    for config in configs:
        key = config["speciesId"]
        grouped.setdefault(key, {})[_signature(config)] = config
    selected = []
    for species_id, records in grouped.items():
        ranked = sorted(
            records.values(),
            key=lambda config: _usage_fit_score(config, datasets, usage_data),
            reverse=True,
        )
        selected.extend(_with_scores(ranked[:MAX_CONFIGS_PER_SPECIES], datasets, usage_data))
    return sorted(selected, key=lambda config: _species_usage_rank(config, datasets, usage_data), reverse=True)


def build_paste_sets_payload(configs: list, selected: list, errors: list) -> dict:
    return {
        "info": {
            "source": "VGCPastes Repository - Champions M-A.csv",
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "parsedConfigCount": len(configs),
            "selectedConfigCount": len(selected),
            "skippedPasteErrors": errors,
        },
        "configs": configs,
        "selected": selected,
    }


def _is_data_row(row: list) -> bool:
    return len(row) > POKEMON_START_COL and str(row[TEAM_ID_COL]).strip().startswith("PC")


def _row_species(row: list) -> list:
    return [str(row[POKEMON_START_COL + offset]).strip() for offset in range(POKEMON_COUNT) if row[POKEMON_START_COL + offset].strip()]


def _raw_url(url: str) -> str:
    return str(url).rstrip("/") + "/raw"


def _parse_header(line: str) -> tuple:
    left, separator, item = line.partition("@")
    species = _extract_species_name(left.strip())
    return species, item.strip() if separator else ""


def _extract_species_name(text: str) -> str:
    no_gender = re.sub(r"\s+\((M|F)\)$", "", text).strip()
    match = re.match(r"^.+\((.+)\)$", no_gender)
    return match.group(1).strip() if match else no_gender


def _base_species_name(species: dict, datasets) -> str:
    entry = datasets.pokedex.get(species["id"], {})
    return entry.get("baseSpecies") or species["name"]


def _parse_prefixed(lines: list, label: str) -> str:
    prefix = f"{label}:"
    return next((line[len(prefix):].strip() for line in lines if line.startswith(prefix)), "")


def _parse_nature(lines: list) -> str:
    return next((line.replace(" Nature", "").strip() for line in lines if line.endswith(" Nature")), "")


def _parse_points(lines: list) -> dict:
    points_line = next((line for line in lines if line.startswith("Points:")), "")
    if points_line:
        return _parse_stat_values(points_line, "Points:")
    ev_line = next((line for line in lines if line.startswith("EVs:")), "")
    if ev_line:
        return _normalize_points(_parse_stat_values(ev_line, "EVs:"))
    raise ValueError("missing EVs or Points line")


def _parse_stat_values(line: str, prefix: str) -> dict:
    values = {key: 0 for key in STAT_KEYS}
    for part in line[len(prefix):].split("/"):
        match = re.match(r"\s*(\d+)\s+([A-Za-z]+)\s*$", part)
        if match and match.group(2) in STAT_MAP:
            values[STAT_MAP[match.group(2)]] = int(match.group(1))
    return values


def _evs_to_points(evs: dict) -> dict:
    return {key: min(32, max(0, (int(evs.get(key, 0)) + 4) // 8)) for key in STAT_KEYS}


def _normalize_points(values: dict) -> dict:
    total = sum(int(values.get(key, 0)) for key in STAT_KEYS)
    if total in {508, 510} or total > CHAMPION_TOTAL_POINTS:
        return _evs_to_points(values)
    return values
def _parse_moves(lines: list, datasets) -> list:
    return [resolve_move(line[2:].strip(), datasets).name for line in lines if line.startswith("- ")]


def _resolve_output_ability(species_name: str, raw_ability: str, datasets) -> str:
    if "-Mega" in species_name:
        return species_ability(species_name, datasets.pokedex)
    return resolve_ability(raw_ability, datasets).name


def _signature(config: dict) -> tuple:
    return (
        config["speciesId"],
        normalize_name(config["item"]),
        normalize_name(config["ability"]),
        normalize_name(config["nature"]),
        tuple(int(config["points"].get(key, 0)) for key in STAT_KEYS),
        tuple(normalize_name(move) for move in config["moves"]),
    )


def _with_scores(configs: list, datasets, usage_data: dict) -> list:
    return [{**config, "score": _usage_fit_score(config, datasets, usage_data)} for config in configs]


def _usage_fit_score(config: dict, datasets, usage_data: dict) -> float:
    profile = _usage_profile(config, datasets, usage_data)
    if not profile:
        return 0
    item = _record_score(profile.get("Items", {}), [config["item"]])
    ability = _record_score(profile.get("Abilities", {}), [config["ability"]])
    moves = _record_score(profile.get("Moves", {}), config["moves"])
    return item * ITEM_SCORE_WEIGHT + ability * ABILITY_SCORE_WEIGHT + moves * MOVE_SCORE_WEIGHT


def _species_usage_rank(config: dict, datasets, usage_data: dict) -> float:
    profile = _usage_profile(config, datasets, usage_data)
    return float(profile.get("usage", profile.get("usageRankScore", 0)) if profile else 0)


def _usage_profile(config: dict, datasets, usage_data: dict) -> dict:
    species = datasets.pokedex.get(config["speciesId"], {})
    names = [species.get("baseSpecies"), species.get("name"), config["species"]]
    data = usage_data.get("data", usage_data)
    for name in filter(None, names):
        if name in data:
            return data[name]
    return {}


def _record_score(record: dict, names: list) -> float:
    if not record or not names:
        return 0
    peak = max(float(value or 0) for value in record.values()) or 1
    scores = [float(record.get(normalize_name(name), record.get(name, 0)) or 0) / peak for name in names]
    return sum(scores) / len(scores)
