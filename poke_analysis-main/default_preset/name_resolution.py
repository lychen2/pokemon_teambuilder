from dataclasses import dataclass

from .common import normalize_name, resolve_pokemon
from .localization import normalize_localized_name, strip_annotation

MAX_FUZZY_DISTANCE = 2

RAW_NAME_ALIASES = {
    "かわりもの": "Imposter",
}

NORMALIZED_NAME_ALIASES = {
    "kingshield": "King's Shield",
    "starmiite": "Starminite",
}


@dataclass(frozen=True)
class ResolvedName:
    name: str
    source: str
    raw: str


def _localized_lookup_match(raw_name: str, localized_lookup: dict) -> str:
    """Try to map a localized (zh / jp) name back to a canonical EN name."""
    if not localized_lookup:
        return ""
    for variant in (raw_name, strip_annotation(raw_name)):
        candidate = localized_lookup.get(normalize_localized_name(variant))
        if candidate:
            return candidate
    return ""


def resolve_named_value(
    raw_name: str,
    lookup: dict,
    value_kind: str,
    localized_lookup: dict | None = None,
) -> ResolvedName:
    raw = str(raw_name or "").strip()
    if not raw:
        return ResolvedName("", "empty", raw)
    direct = lookup.get(normalize_name(raw))
    if direct:
        return ResolvedName(direct, "exact", raw)
    alias = _alias_for(raw)
    if alias:
        direct = lookup.get(normalize_name(alias))
        if direct:
            return ResolvedName(direct, "alias", raw)
    if localized_lookup:
        canonical = _localized_lookup_match(raw, localized_lookup)
        if canonical:
            direct = lookup.get(normalize_name(canonical)) or canonical
            return ResolvedName(direct, "localized", raw)
    raise ValueError(f"Unknown {value_kind}: {raw}")


def resolve_item(raw_name: str, datasets, species_name: str = "") -> ResolvedName:
    raw = str(raw_name or "").strip()
    if not raw:
        return ResolvedName("", "empty", raw)
    direct = _resolve_item_direct(raw, datasets)
    if direct.name:
        return direct
    localized_lookup = getattr(datasets, "localized_item_lookup", {}) or {}
    canonical = _localized_lookup_match(raw, localized_lookup)
    if canonical:
        direct_name = datasets.item_lookup.get(normalize_name(canonical)) or canonical
        return ResolvedName(direct_name, "localized", raw)
    fuzzy = _resolve_item_fuzzy(raw, datasets, species_name)
    if fuzzy.name:
        return fuzzy
    raise ValueError(f"Unknown item: {raw}")


def resolve_ability(raw_name: str, datasets) -> ResolvedName:
    return resolve_named_value(
        raw_name,
        datasets.ability_lookup,
        "ability",
        getattr(datasets, "localized_ability_lookup", {}),
    )


def resolve_move(raw_name: str, datasets) -> ResolvedName:
    return resolve_named_value(
        raw_name,
        datasets.move_lookup,
        "move",
        getattr(datasets, "localized_move_lookup", {}),
    )


def resolve_nature(raw_name: str, datasets) -> ResolvedName:
    """Map a localized nature name (Chinese / annotated) back to canonical EN.

    Nature names are not stored in any local JSON dataset, so we rely entirely
    on the inverted localization table built into ``datasets``. Pass-through
    when the input is already a known EN nature name.
    """
    raw = str(raw_name or "").strip()
    if not raw:
        return ResolvedName("", "empty", raw)
    from .localization import NATURE_NAMES
    normalized = normalize_name(raw)
    for candidate in NATURE_NAMES:
        if normalize_name(candidate) == normalized:
            return ResolvedName(candidate, "exact", raw)
    localized_lookup = getattr(datasets, "localized_nature_lookup", {}) or {}
    canonical = _localized_lookup_match(raw, localized_lookup)
    if canonical:
        return ResolvedName(canonical, "localized", raw)
    raise ValueError(f"Unknown nature: {raw}")


def resolve_species(raw_name: str, datasets) -> dict:
    resolved = resolve_pokemon(raw_name, datasets.pokedex_lookup)
    if resolved:
        return resolved
    raise ValueError(f"Unknown species: {raw_name}")


def maybe_mega_species(species_name: str, item_name: str, datasets) -> str:
    if not item_name:
        return species_name
    mega_info = datasets.mega_stone_lookup.get(normalize_name(item_name))
    if not mega_info:
        return species_name
    return mega_info["mega_species"]


def _alias_for(raw_name: str) -> str:
    stripped = str(raw_name or "").strip()
    return RAW_NAME_ALIASES.get(stripped) or NORMALIZED_NAME_ALIASES.get(normalize_name(stripped), "")


def _resolve_item_direct(raw_name: str, datasets) -> ResolvedName:
    direct = datasets.item_lookup.get(normalize_name(raw_name))
    if direct:
        return ResolvedName(direct, "exact", raw_name)
    alias = _alias_for(raw_name)
    if not alias:
        return ResolvedName("", "missing", raw_name)
    direct = datasets.item_lookup.get(normalize_name(alias))
    return ResolvedName(direct, "alias", raw_name) if direct else ResolvedName("", "missing", raw_name)


def _resolve_item_fuzzy(raw_name: str, datasets, species_name: str) -> ResolvedName:
    candidates = _species_mega_item_candidates(species_name, datasets)
    matches = _fuzzy_matches(raw_name, candidates)
    if len(matches) == 1:
        return ResolvedName(matches[0], "fuzzy", raw_name)
    if len(matches) > 1:
        names = ", ".join(matches)
        raise ValueError(f"Ambiguous item spelling '{raw_name}': {names}")
    return ResolvedName("", "missing", raw_name)


def _species_mega_item_candidates(species_name: str, datasets) -> list:
    if not species_name:
        return []
    resolved = resolve_pokemon(species_name, datasets.pokedex_lookup)
    if not resolved:
        return []
    species = resolved["name"]
    candidates = []
    for item in datasets.items.values():
        if not isinstance(item, dict):
            continue
        if species not in (item.get("itemUser") or []):
            continue
        if not item.get("megaStone"):
            continue
        candidates.append(item["name"])
    return sorted(set(candidates))


def _fuzzy_matches(raw_name: str, candidates: list) -> list:
    raw_key = normalize_name(raw_name)
    matches = []
    for candidate in candidates:
        distance = _levenshtein(raw_key, normalize_name(candidate))
        if distance <= MAX_FUZZY_DISTANCE:
            matches.append(candidate)
    return matches


def _levenshtein(left: str, right: str) -> int:
    if left == right:
        return 0
    if not left:
        return len(right)
    if not right:
        return len(left)
    previous = list(range(len(right) + 1))
    for left_index, left_char in enumerate(left, start=1):
        current = [left_index]
        for right_index, right_char in enumerate(right, start=1):
            cost = 0 if left_char == right_char else 1
            current.append(min(
                current[right_index - 1] + 1,
                previous[right_index] + 1,
                previous[right_index - 1] + cost,
            ))
        previous = current
    return previous[-1]
