"""Refresh static/usage_official.json via PokéChamp DB scraping."""
from __future__ import annotations

import sys

from default_preset.common import (
    DEFAULT_FORMAT,
    DEFAULT_SEASON,
    USAGE_OFFICIAL_PATH,
    load_local_datasets,
)
from default_preset.pokechamp import (
    PokeChampClient,
    build_usage_official,
    canonicalize_usage_official_payload,
)


def update_official_usage_data(
    season: str = DEFAULT_SEASON,
    battle_format: str = DEFAULT_FORMAT,
    refresh: bool = False,
    limit: int = 0,
) -> None:
    """Scrape PokéChamp DB and write canonicalized payload to STATIC_DIR/usage_official.json."""
    print("Refreshing official usage data from PokéChamp DB...")
    datasets = load_local_datasets()
    client = PokeChampClient(refresh=refresh)
    usage_official = build_usage_official(
        client=client,
        datasets=datasets,
        season=season,
        battle_format=battle_format,
        limit=limit,
    )
    client.save_cache()
    canonical = canonicalize_usage_official_payload(usage_official.payload, datasets)
    USAGE_OFFICIAL_PATH.write_text(_dumps(canonical), encoding="utf-8")
    print(f"Wrote official usage data to {USAGE_OFFICIAL_PATH}")


def _dumps(payload) -> str:
    import json
    return json.dumps(payload, ensure_ascii=False, indent=2) + "\n"


if __name__ == "__main__":
    try:
        update_official_usage_data()
    except Exception as exc:  # noqa: BLE001 -- surface scraping failures
        print(f"Failed to refresh official usage: {exc}", file=sys.stderr)
        sys.exit(1)
