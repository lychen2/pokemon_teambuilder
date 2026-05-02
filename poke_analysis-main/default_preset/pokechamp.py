import json
import random
import time
from dataclasses import dataclass
from datetime import datetime, timezone

import requests

from .common import ROOT, resolve_pokemon
from .name_resolution import resolve_ability, resolve_item, resolve_move, resolve_nature
from .pokechamp_parse import parse_index_page, parse_pokemon_page

BASE_URL = "https://pokechamdb.com"
INDEX_PATH = "/zh-Hans"
DETAIL_PATH = "/zh-Hans/pokemon"
CACHE_PATH = ROOT / "poke_analysis-main" / "stats" / "pokechamp_cache.json"
USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
ACCEPT_LANGUAGE = "zh-CN,zh;q=0.9,en;q=0.5"
REQUEST_DELAY_SECONDS = (0.35, 0.85)
REQUEST_TIMEOUT_SECONDS = 40
MAX_FETCH_ATTEMPTS = 3
RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}
RETRY_DELAY_SECONDS = 5
MAX_PARTNER_RANK = 10


@dataclass(frozen=True)
class UsageOfficial:
    payload: dict

    def to_json(self) -> str:
        return json.dumps(self.payload, ensure_ascii=False, indent=2) + "\n"


class PokeChampClient:
    def __init__(self, refresh=False):
        self.refresh = refresh
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": USER_AGENT, "Accept-Language": ACCEPT_LANGUAGE})
        self.cache = self._load_cache()

    def _load_cache(self):
        if self.refresh or not CACHE_PATH.exists():
            return {}
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))

    def save_cache(self):
        CACHE_PATH.write_text(json.dumps(self.cache, ensure_ascii=False, indent=2), encoding="utf-8")

    def fetch(self, url: str) -> str:
        if not self.refresh and url in self.cache:
            return self.cache[url]["html"]
        response = self._fetch_response(url)
        html = response.text
        self.cache[url] = {"html": html, "fetchedAt": datetime.now(timezone.utc).isoformat()}
        self.save_cache()
        time.sleep(random.uniform(*REQUEST_DELAY_SECONDS))
        return html

    def _fetch_response(self, url: str):
        for attempt in range(1, MAX_FETCH_ATTEMPTS + 1):
            response = self.session.get(url, timeout=REQUEST_TIMEOUT_SECONDS)
            if response.status_code not in RETRYABLE_STATUS_CODES:
                response.raise_for_status()
                return response
            print(f"  HTTP {response.status_code} for {url}; retry {attempt}/{MAX_FETCH_ATTEMPTS}")
            if attempt < MAX_FETCH_ATTEMPTS:
                time.sleep(RETRY_DELAY_SECONDS)
        response.raise_for_status()


def build_usage_official(client, datasets, season, battle_format, limit=0):
    index_url = _index_url(season, battle_format)
    index_html = client.fetch(index_url)
    index = parse_index_page(index_html, index_url)
    rankings = index["rankings"][:limit] if limit > 0 else index["rankings"]
    data, skipped = _fetch_ranked_profiles(client, datasets, rankings, season, battle_format)
    payload = _usage_payload(index, data, skipped, season, battle_format, index_url)
    return UsageOfficial(payload)


def to_legacy_usage_profile(profile: dict, total_ranked: int) -> dict:
    rank_score = _rank_score(profile["rank"], total_ranked)
    return {
        "rank": profile["rank"],
        "rankScore": rank_score,
        "usageRankScore": rank_score,
        "Moves": _percent_map(profile["moves"]),
        "Items": _percent_map(profile["items"]),
        "Abilities": _percent_map(profile["abilities"]),
        "Natures": _percent_map(profile["natures"]),
        "Teammates": _partner_score_map(profile["partners"]),
        "usageOfficial": profile,
    }


def canonicalize_usage_official_payload(payload: dict, datasets, strict=False) -> dict:
    data = {}
    errors = []
    for species, legacy in (payload.get("data") or {}).items():
        profile = legacy.get("usageOfficial")
        if not profile:
            data[species] = legacy
            continue
        normalized = _canonicalize_profile(profile, datasets, strict, errors)
        data[species] = {
            **legacy,
            "Moves": _percent_map(normalized["moves"]),
            "Items": _percent_map(normalized["items"]),
            "Abilities": _percent_map(normalized["abilities"]),
            "Natures": _percent_map(normalized["natures"]),
            "usageOfficial": normalized,
        }
    info = {**(payload.get("info") or {})}
    if errors:
        info["normalizationErrors"] = errors
    return {**payload, "info": info, "data": data}


def _fetch_ranked_profiles(client, datasets, rankings, season, battle_format):
    data = {}
    skipped = []
    total = len(rankings)
    for index, ranking in enumerate(rankings, start=1):
        print(f"Fetching PokéChamp {index}/{total}: {ranking['name']}")
        html = client.fetch(_detail_url(ranking["slug"], season, battle_format))
        profile = parse_pokemon_page(html, ranking)
        # Slug is invariant across language variants (always EN), so it's the
        # safest primary key for resolving the local pokedex entry. Page H1 and
        # ranking name are localized on zh-Hans and would otherwise need a
        # reverse-localization round-trip.
        resolved = (
            resolve_pokemon(ranking["slug"], datasets.pokedex_lookup)
            or resolve_pokemon(profile["name"], datasets.pokedex_lookup)
            or resolve_pokemon(ranking["name"], datasets.pokedex_lookup)
        )
        if not resolved:
            skipped.append({"name": profile["name"], "reason": "missing local pokedex entry"})
            continue
        profile["name"] = resolved["name"]
        profile = _canonicalize_profile(profile, datasets)
        data[resolved["name"]] = to_legacy_usage_profile(profile, total)
    return data, skipped


def _usage_payload(index, data, skipped, season, battle_format, source_url):
    return {
        "info": {
            "source": "PokéChamp DB",
            "sourceUrl": source_url,
            "season": season,
            "format": battle_format,
            "seasonLabel": index["seasonLabel"],
            "lastUpdated": index["lastUpdated"],
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "metricNotes": {
                "Moves/Items/Abilities/Natures": "percent usage shown by PokéChamp DB",
                "Teammates": "partner rank score, 10 for #1 through 1 for #10",
                "usageRankScore": "derived popularity score from official rank order",
            },
            "rankings": index["rankings"],
            "skipped": skipped,
        },
        "data": data,
    }


def _canonicalize_profile(profile: dict, datasets, strict=True, errors=None) -> dict:
    species = profile["name"]
    return {
        **profile,
        "moves": _canonicalize_entries(
            profile.get("moves", []),
            lambda name: resolve_move(name, datasets),
            strict,
            errors,
            species,
        ),
        "items": _canonicalize_entries(
            profile.get("items", []),
            lambda name: resolve_item(name, datasets, species),
            strict,
            errors,
            species,
        ),
        "abilities": _canonicalize_entries(
            profile.get("abilities", []),
            lambda name: resolve_ability(name, datasets),
            strict,
            errors,
            species,
        ),
        "natures": _canonicalize_entries(
            profile.get("natures", []),
            lambda name: resolve_nature(name, datasets),
            strict,
            errors,
            species,
        ),
    }


def _canonicalize_entries(entries: list, resolver, strict: bool, errors: list, species: str) -> list:
    out = []
    for entry in entries:
        try:
            resolved = resolver(entry["name"])
        except ValueError as error:
            if strict:
                raise
            errors.append({"species": species, "name": entry["name"], "error": str(error)})
            out.append(entry)
            continue
        next_entry = {**entry, "name": resolved.name}
        if resolved.source not in {"exact", "empty"}:
            next_entry["rawName"] = resolved.raw
            next_entry["nameSource"] = resolved.source
        out.append(next_entry)
    return out


def _index_url(season: str, battle_format: str) -> str:
    return f"{BASE_URL}{INDEX_PATH}?format={battle_format}&view=pokemon&season={season}"


def _detail_url(slug: str, season: str, battle_format: str) -> str:
    return f"{BASE_URL}{DETAIL_PATH}/{slug}?format={battle_format}&season={season}"


def _percent_map(entries):
    return {entry["name"]: entry["percent"] for entry in entries}


def _partner_score_map(partners):
    return {entry["name"]: MAX_PARTNER_RANK + 1 - entry["rank"] for entry in partners}


def _rank_score(rank: int, total_ranked: int) -> float:
    if total_ranked <= 0:
        return 0
    return (total_ranked - rank + 1) / total_ranked
