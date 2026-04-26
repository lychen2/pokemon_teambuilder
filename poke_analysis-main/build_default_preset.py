#!/usr/bin/env python3
"""Build official usage data and config-default.txt from PokéChamp DB.

Run manually:
  python poke_analysis-main/build_default_preset.py
"""

import argparse

from default_preset.common import (
    DEFAULT_FORMAT,
    DEFAULT_SEASON,
    OUTPUT_PATH,
    USAGE_PATH,
    USAGE_OFFICIAL_PATH,
    load_json,
    load_local_datasets,
)
from default_preset.pokechamp import PokeChampClient, build_usage_official, canonicalize_usage_official_payload
from default_preset.preset_builder import build_default_preset
from default_preset.vgcpastes import build_vgcpastes_preset


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--season", default=DEFAULT_SEASON)
    parser.add_argument("--format", default=DEFAULT_FORMAT)
    parser.add_argument("--refresh", action="store_true", help="Ignore cached PokéChamp pages")
    parser.add_argument("--limit", type=int, default=0, help="Only process first N ranked Pokemon")
    parser.add_argument("--usage-only", action="store_true", help="Only write usage_official.json")
    parser.add_argument("--source", choices=("vgcpastes", "pokechamp"), default="vgcpastes")
    parser.add_argument("--strict-pastes", action="store_true", help="Fail when any Pokepaste row is invalid")
    return parser.parse_args()


def main():
    args = parse_args()
    datasets = load_local_datasets()
    usage_official = load_or_build_usage_official(args, datasets)
    USAGE_OFFICIAL_PATH.write_text(
        json_dumps(canonicalize_usage_official_payload(usage_official, datasets)),
        encoding="utf-8",
    )
    print(f"Wrote official usage data to {USAGE_OFFICIAL_PATH}")

    if args.usage_only:
        return

    if args.source == "pokechamp":
        preset_text, count = build_default_preset(usage_official.payload, datasets)
    else:
        usage_data = load_json(USAGE_PATH)
        preset_text, count, _ = build_vgcpastes_preset(
            datasets=datasets,
            usage_data=usage_data,
            refresh=args.refresh,
            limit=args.limit,
            strict=args.strict_pastes,
        )
    OUTPUT_PATH.write_text(preset_text, encoding="utf-8")
    print(f"Wrote {count} default preset entries to {OUTPUT_PATH}")


def load_or_build_usage_official(args, datasets):
    if USAGE_OFFICIAL_PATH.exists() and not args.refresh and not args.usage_only:
        return load_json(USAGE_OFFICIAL_PATH)
    client = PokeChampClient(refresh=args.refresh)
    usage_official = build_usage_official(
        client=client,
        datasets=datasets,
        season=args.season,
        battle_format=args.format,
        limit=args.limit,
    )
    client.save_cache()
    return usage_official.payload


def json_dumps(payload):
    import json
    return json.dumps(payload, ensure_ascii=False, indent=2) + "\n"


if __name__ == "__main__":
    main()
