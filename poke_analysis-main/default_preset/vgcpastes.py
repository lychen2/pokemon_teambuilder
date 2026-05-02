import csv
import json
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone

import requests

from .common import (
    PASTE_SETS_PATH,
    PASTE_TEAMS_PATH,
    ROOT,
    STAT_KEYS,
    VGCPASTES_CSV_PATH,
    format_preset_block,
    normalize_name,
    species_ability,
)
from .name_resolution import maybe_mega_species, resolve_ability, resolve_item, resolve_move, resolve_species
TEAM_ID_COL = 0
DESCRIPTION_COL = 1
PASTE_URL_COL = 24
EVS_COL = 25
DATE_COL = 29
OWNER_COL = 35
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
DIVERSITY_WEIGHT_ITEM = 1
DIVERSITY_WEIGHT_ABILITY = 5
DIVERSITY_WEIGHT_NATURE = 2
DIVERSITY_WEIGHT_MOVES = 4
DIVERSITY_WEIGHT_POINTS = 2
POINTS_DISTANCE_NORMALIZER = 132
PASTE_TEAMS_TOP_N = 0
PASTE_TEAMS_DUP_THRESHOLD = 5
STAT_MAP = {"HP": "hp", "Atk": "atk", "Def": "def", "SpA": "spa", "SpD": "spd", "Spe": "spe"}
MONTH_NAMES = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "jun": 6, "jul": 7,
    "aug": 8, "sep": 9, "sept": 9, "oct": 10, "nov": 11, "dec": 12,
}

@dataclass(frozen=True)
class PasteRow:
    team_id: str
    url: str
    species_names: tuple
    date_shared: str = ""
    description: str = ""
    owner: str = ""


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
    teams = build_paste_teams(configs)
    teams_payload = build_paste_teams_payload(teams)
    PASTE_TEAMS_PATH.write_text(json.dumps(teams_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
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
            date_shared = str(row[DATE_COL]).strip() if len(row) > DATE_COL else ""
            description = str(row[DESCRIPTION_COL]).strip() if len(row) > DESCRIPTION_COL else ""
            owner = str(row[OWNER_COL]).strip() if len(row) > OWNER_COL else ""
            rows.append(PasteRow(
                team_id=row[TEAM_ID_COL].strip(),
                url=paste_url,
                species_names=species,
                date_shared=date_shared,
                description=description,
                owner=owner,
            ))
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
        "source": {
            "teamId": row.team_id,
            "url": row.url,
            "slot": index,
            "dateShared": row.date_shared,
            "description": row.description,
            "owner": row.owner,
        },
    }

def select_common_configs(configs: list, datasets, usage_data: dict) -> list:
    grouped = {}
    for config in configs:
        species_key = config["speciesId"]
        signature = _signature(config)
        bucket = grouped.setdefault(species_key, {})
        existing = bucket.get(signature)
        if existing is None or _config_date_key(config) > _config_date_key(existing):
            bucket[signature] = config
    selected = []
    for _species_id, records in grouped.items():
        candidates = list(records.values())
        chosen = _cluster_select(candidates, datasets, usage_data)
        for entry in chosen:
            config = entry["config"]
            selected.append({
                **config,
                "score": _usage_fit_score(config, datasets, usage_data),
                "archetypeIndex": entry["index"],
                "archetypeSize": entry["size"],
                "archetypeShare": entry["share"],
                "archetypeCount": entry["totalArchetypes"],
            })
    return sorted(
        selected,
        key=lambda config: (
            _species_usage_rank(config, datasets, usage_data),
            -config.get("archetypeIndex", 0),
        ),
        reverse=True,
    )


def _cluster_select(candidates: list, datasets, usage_data: dict) -> list:
    n = len(candidates)
    if n == 0:
        return []
    k = min(MAX_CONFIGS_PER_SPECIES, n)
    distance_matrix = _build_distance_matrix(candidates)
    cluster_indices = _agglomerative_cluster(distance_matrix, k)
    cluster_indices.sort(key=len, reverse=True)
    total_members = sum(len(cluster) for cluster in cluster_indices)
    archetype_total = len(cluster_indices)
    result = []
    for idx, cluster in enumerate(cluster_indices):
        medoid_idx = _select_medoid(cluster, candidates, distance_matrix, datasets, usage_data)
        result.append({
            "config": candidates[medoid_idx],
            "index": idx,
            "size": len(cluster),
            "share": len(cluster) / total_members if total_members else 0.0,
            "totalArchetypes": archetype_total,
        })
    return result


def _build_distance_matrix(candidates: list) -> list:
    n = len(candidates)
    matrix = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(i + 1, n):
            distance = _config_distance(candidates[i], candidates[j])
            matrix[i][j] = distance
            matrix[j][i] = distance
    return matrix


def _agglomerative_cluster(distance_matrix: list, target_clusters: int) -> list:
    n = len(distance_matrix)
    clusters = [[i] for i in range(n)]
    while len(clusters) > target_clusters:
        best_pair = None
        best_distance = float("inf")
        for i in range(len(clusters)):
            for j in range(i + 1, len(clusters)):
                distance = _average_linkage(clusters[i], clusters[j], distance_matrix)
                if distance < best_distance:
                    best_distance = distance
                    best_pair = (i, j)
        i, j = best_pair
        clusters[i] = clusters[i] + clusters[j]
        clusters.pop(j)
    return clusters


def _average_linkage(cluster_a: list, cluster_b: list, distance_matrix: list) -> float:
    total = 0.0
    for a in cluster_a:
        for b in cluster_b:
            total += distance_matrix[a][b]
    return total / (len(cluster_a) * len(cluster_b))


def _select_medoid(cluster: list, candidates: list, distance_matrix: list, datasets, usage_data: dict) -> int:
    if len(cluster) == 1:
        return cluster[0]
    best_idx = cluster[0]
    best_key = None
    for i in cluster:
        total_distance = sum(distance_matrix[i][j] for j in cluster if j != i)
        usage = _usage_fit_score(candidates[i], datasets, usage_data)
        recency = _config_date_key(candidates[i]).toordinal()
        key = (total_distance, -usage, -recency)
        if best_key is None or key < best_key:
            best_key = key
            best_idx = i
    return best_idx


def _config_distance(a: dict, b: dict) -> float:
    distance = 0.0
    if normalize_name(a["item"]) != normalize_name(b["item"]):
        distance += DIVERSITY_WEIGHT_ITEM
    if normalize_name(a["ability"]) != normalize_name(b["ability"]):
        distance += DIVERSITY_WEIGHT_ABILITY
    if normalize_name(a["nature"]) != normalize_name(b["nature"]):
        distance += DIVERSITY_WEIGHT_NATURE
    moves_a = {normalize_name(move) for move in a["moves"]}
    moves_b = {normalize_name(move) for move in b["moves"]}
    union = moves_a | moves_b
    if union:
        distance += DIVERSITY_WEIGHT_MOVES * len(moves_a ^ moves_b) / len(union)
    points_diff = sum(abs(int(a["points"].get(key, 0)) - int(b["points"].get(key, 0))) for key in STAT_KEYS)
    distance += DIVERSITY_WEIGHT_POINTS * min(1.0, points_diff / POINTS_DISTANCE_NORMALIZER)
    return distance


def _config_date_key(config: dict) -> datetime:
    parsed = _parse_share_date(config)
    return parsed if parsed else datetime.min


def _parse_share_date(config: dict):
    raw = (config.get("source") or {}).get("dateShared", "")
    return _parse_date_text(raw)


def _parse_date_text(text: str):
    if not text:
        return None
    cleaned = text.strip().replace(",", " ")
    cleaned = re.sub(r"\s+", " ", cleaned)
    match = re.match(r"^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})$", cleaned)
    if match:
        day, month_name, year = match.groups()
        month = MONTH_NAMES.get(month_name.lower())
        if month:
            try:
                return datetime(int(year), month, int(day))
            except ValueError:
                return None
    match = re.match(r"^([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{4})$", cleaned)
    if match:
        month_name, day, year = match.groups()
        month = MONTH_NAMES.get(month_name.lower())
        if month:
            try:
                return datetime(int(year), month, int(day))
            except ValueError:
                return None
    match = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})$", cleaned)
    if match:
        year, month, day = match.groups()
        try:
            return datetime(int(year), int(month), int(day))
        except ValueError:
            return None
    return None


def build_paste_teams(configs: list, top_n: int = PASTE_TEAMS_TOP_N, dup_threshold: int = PASTE_TEAMS_DUP_THRESHOLD) -> list:
    teams_by_id = {}
    for config in configs:
        team_id = (config.get("source") or {}).get("teamId")
        if not team_id:
            continue
        teams_by_id.setdefault(team_id, []).append(config)
    teams = []
    for team_id, members in teams_by_id.items():
        if len(members) != POKEMON_COUNT:
            continue
        members_sorted = sorted(members, key=lambda c: int((c.get("source") or {}).get("slot", 0)))
        head_source = members_sorted[0].get("source", {})
        teams.append({
            "teamId": team_id,
            "description": head_source.get("description", ""),
            "owner": head_source.get("owner", ""),
            "dateShared": head_source.get("dateShared", ""),
            "url": head_source.get("url", ""),
            "memberSpeciesIds": [member["speciesId"] for member in members_sorted],
            "memberSpeciesNames": [member["species"] for member in members_sorted],
            "configs": [_clean_team_member(member) for member in members_sorted],
        })
    teams.sort(key=lambda team: _parse_date_text(team["dateShared"]) or datetime.min, reverse=True)
    kept = []
    for team in teams:
        species_set = set(team["memberSpeciesIds"])
        if any(len(species_set & set(other["memberSpeciesIds"])) >= dup_threshold for other in kept):
            continue
        kept.append(team)
        if top_n and len(kept) >= top_n:
            break
    return kept


def _clean_team_member(config: dict) -> dict:
    return {
        "species": config["species"],
        "speciesId": config["speciesId"],
        "item": config["item"],
        "ability": config["ability"],
        "nature": config["nature"],
        "points": dict(config["points"]),
        "moves": list(config["moves"]),
        "note": config.get("note", ""),
        "slot": int((config.get("source") or {}).get("slot", 0)),
    }


def build_paste_teams_payload(teams: list) -> dict:
    return {
        "info": {
            "source": "VGCPastes Repository - Champions M-A.csv",
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "teamCount": len(teams),
            "topN": PASTE_TEAMS_TOP_N,
            "duplicateSpeciesThreshold": PASTE_TEAMS_DUP_THRESHOLD,
        },
        "teams": teams,
    }


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
    resolved = resolve_ability(raw_ability, datasets).name
    species_entry = datasets.pokedex.get(normalize_name(species_name), {})
    species_abilities = list((species_entry.get("abilities") or {}).values())
    if species_abilities:
        normalized_target = normalize_name(resolved)
        normalized_pool = {normalize_name(ability) for ability in species_abilities}
        if normalized_target not in normalized_pool:
            raise ValueError(
                f"{species_name} cannot have ability {resolved} (legal: {', '.join(species_abilities)})"
            )
    return resolved


def _signature(config: dict) -> tuple:
    return (
        config["speciesId"],
        normalize_name(config["item"]),
        normalize_name(config["ability"]),
        normalize_name(config["nature"]),
        tuple(int(config["points"].get(key, 0)) for key in STAT_KEYS),
        frozenset(normalize_name(move) for move in config["moves"]),
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
