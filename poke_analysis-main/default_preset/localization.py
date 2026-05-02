"""Reverse-localization helpers: map localized names (zh / jp) back to canonical EN.

PokéChamp DB zh-Hans serves Chinese move/item/ability/nature names. We invert
``static/localization-data.json`` (which stores EN -> ZH) to recover the EN
canonical name needed by the local datasets. Nature translations carry a
``(+stat, -stat)`` annotation that must be stripped before matching the
bare name shown on the scraped page.

Note: ``common.normalize_name`` strips everything except ``[a-z0-9]``, which
nukes CJK characters. We use a CJK-preserving normalizer here that only
collapses whitespace, parentheses, and a few decorative ASCII punctuation
characters that commonly appear in localized strings.
"""
from __future__ import annotations

import json
import re

from .common import LOCALIZATION_PATH

_ANNOTATION_RE = re.compile(r"\s*[（(].*?[）)]\s*$")
_LOCALIZED_NORMALIZE_RE = re.compile(r"[\s　'\-·•]+")

NATURE_NAMES = frozenset({
    "Adamant", "Bashful", "Bold", "Brave", "Calm", "Careful",
    "Docile", "Gentle", "Hardy", "Hasty", "Impish", "Jolly",
    "Lax", "Lonely", "Mild", "Modest", "Naive", "Naughty",
    "Quiet", "Quirky", "Rash", "Relaxed", "Sassy", "Serious", "Timid",
})


def load_translations() -> dict:
    if not LOCALIZATION_PATH.exists():
        return {}
    payload = json.loads(LOCALIZATION_PATH.read_text(encoding="utf-8"))
    return payload.get("translations", {}) or {}


def strip_annotation(value: str) -> str:
    return _ANNOTATION_RE.sub("", str(value or "")).strip()


def normalize_localized_name(value: str) -> str:
    """CJK-preserving normalizer: lowercase + drop whitespace and decorative punctuation.

    Distinct from ``common.normalize_name`` because the latter is ASCII-only and
    would erase Chinese / Japanese characters entirely.
    """
    return _LOCALIZED_NORMALIZE_RE.sub("", str(value or "").lower().strip())


def _canonical_en_names(entries: dict) -> set:
    names = set()
    for entry in entries.values():
        if isinstance(entry, dict) and entry.get("name"):
            names.add(entry["name"])
    return names


def _build_lookup(translations: dict, allowed_canonical: set) -> dict:
    out: dict = {}
    for en_name, localized in translations.items():
        if not en_name or not localized:
            continue
        if en_name not in allowed_canonical:
            continue
        for variant in (localized, strip_annotation(localized)):
            key = normalize_localized_name(variant)
            if key and key not in out:
                out[key] = en_name
    return out


def build_localized_lookups(
    translations: dict,
    moves: dict,
    items: dict,
    abilities: dict,
) -> dict:
    return {
        "moves": _build_lookup(translations, _canonical_en_names(moves)),
        "items": _build_lookup(translations, _canonical_en_names(items)),
        "abilities": _build_lookup(translations, _canonical_en_names(abilities)),
        "natures": _build_lookup(translations, NATURE_NAMES),
    }

