#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = REPO_ROOT / "assets" / "data" / "team-planner-assets.json"
ICON_ROOT = REPO_ROOT / "assets" / "pokemon"
TIMEOUT_SECONDS = 30
CHUNK_SIZE = 1024 * 64
MAX_WORKERS = 32

def load_pokemon_assets() -> dict[str, dict[str, object]]:
    with MANIFEST_PATH.open("r", encoding="utf-8") as manifest_file:
        manifest = json.load(manifest_file)
    pokemon_assets = manifest.get("pokemon")
    if not isinstance(pokemon_assets, dict):
        raise ValueError(f"Expected pokemon object in {MANIFEST_PATH}")
    return pokemon_assets


def build_download_targets(pokemon_assets: dict[str, dict[str, object]]) -> tuple[dict[str, tuple[Path, str]], list[str]]:
    targets: dict[str, tuple[Path, str]] = {}
    failures: list[str] = []
    for species_id, asset_value in pokemon_assets.items():
        if not isinstance(asset_value, dict):
            failures.append(f"{species_id}: expected object")
            continue

        file_value = asset_value.get("file")
        source_url_value = asset_value.get("sourceUrl")
        if not isinstance(file_value, str) or not file_value:
            failures.append(f"{species_id}: missing file")
            continue
        if not isinstance(source_url_value, str) or not source_url_value:
            failures.append(f"{species_id}: missing sourceUrl")
            continue

        targets.setdefault(file_value, (ICON_ROOT / file_value, source_url_value))
    return targets, failures


def download_icon(source_url: str, target_path: Path) -> None:
    request = urllib.request.Request(source_url, headers={"User-Agent": "poketeam-display-icon-sync/1.0"})
    temporary_path = target_path.with_name(f"{target_path.name}.tmp")
    target_path.parent.mkdir(parents=True, exist_ok=True)
    bytes_written = 0
    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
        with temporary_path.open("wb") as output_file:
            while True:
                chunk = response.read(CHUNK_SIZE)
                if not chunk:
                    break
                bytes_written += len(chunk)
                output_file.write(chunk)
    if bytes_written == 0:
        temporary_path.unlink(missing_ok=True)
        raise ValueError("empty response")
    os.replace(temporary_path, target_path)


def main() -> int:
    targets, failures = build_download_targets(load_pokemon_assets())
    existing_count = 0
    downloaded_count = 0
    pending: list[tuple[str, Path, str]] = []

    for file_value, (target_path, source_url) in targets.items():
        if target_path.exists() and target_path.stat().st_size > 0:
            existing_count += 1
            continue
        pending.append((file_value, target_path, source_url))

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(download_icon, source_url, target_path): (file_value, source_url) for file_value, target_path, source_url in pending}
        for future in as_completed(futures):
            file_value, source_url = futures[future]
            try:
                future.result()
                downloaded_count += 1
            except (OSError, ValueError, urllib.error.URLError, urllib.error.HTTPError) as error:
                failures.append(f"{file_value}: {source_url}: {error}")
    print(f"existing={existing_count} downloaded={downloaded_count} failed={len(failures)}")
    if failures:
        for failure in failures[:20]:
            print(failure, file=sys.stderr)
        if len(failures) > 20:
            print(f"... {len(failures) - 20} more failures", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
