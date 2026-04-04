import json
import re
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
STATS_DIR = ROOT / "poke_analysis-main" / "stats"
STATIC_DIR = ROOT / "static"
CORE_JSON_FILES = {
    "items.json",
    "abilities.json",
    "moves.json",
    "pokedex.json",
    "forms_index.json",
}
TEXT_SOURCES = (
    ("https://play.pokemonshowdown.com/data/items.js", STATS_DIR / "items.json", "items"),
    ("https://play.pokemonshowdown.com/data/abilities.js", STATS_DIR / "abilities.json", "abilities"),
    ("https://play.pokemonshowdown.com/data/moves.json", STATS_DIR / "moves.json", "moves"),
    ("https://play.pokemonshowdown.com/data/pokedex.json", STATS_DIR / "pokedex.json", "pokedex"),
)
BINARY_SOURCES = (
    ("https://play.pokemonshowdown.com/sprites/pokemonicons-sheet.png", STATIC_DIR / "pokemonicons-sheet.png", "pokemon icons"),
    ("https://play.pokemonshowdown.com/sprites/itemicons-sheet.png", STATIC_DIR / "itemicons-sheet.png", "item icons"),
)
FORMS_SOURCE = "https://play.pokemonshowdown.com/js/battle-dex-data.js"


def ensure_directories():
    STATS_DIR.mkdir(parents=True, exist_ok=True)
    STATIC_DIR.mkdir(parents=True, exist_ok=True)


def prune_usage_files():
    removed = 0
    for path in STATS_DIR.glob("*.json"):
        if path.name in CORE_JSON_FILES:
            continue
        path.unlink()
        removed += 1
    print(f"Removed {removed} metagame/usage files.")


def fetch_text(url):
    response = requests.get(url, timeout=60)
    response.raise_for_status()
    return response.text


def write_text_source(url, destination, label):
    print(f"Updating {label}.")
    content = fetch_text(url)
    if destination.name in {"items.json", "abilities.json"}:
        content = "{" + content.split("{", 1)[1][:-1]
    destination.write_text(content, encoding="utf-8")


def write_binary_source(url, destination, label):
    print(f"Updating {label}.")
    response = requests.get(url, stream=True, timeout=60)
    response.raise_for_status()
    with destination.open("wb") as file_obj:
        for chunk in response.iter_content(chunk_size=8192):
            file_obj.write(chunk)


def extract_forms_index():
    print("Updating forms index.")
    content = fetch_text(FORMS_SOURCE)
    match = re.search(r"BattlePokemonIconIndexes\s*=\s*\{(.*?)\n\};", content, re.DOTALL)
    if not match:
        raise ValueError("BattlePokemonIconIndexes not found in battle-dex-data.js")

    raw_body = match.group(1).replace("\t", " ")

    entries = []
    for part in raw_body.split(","):
        item = part.strip()
        if not item:
            continue
        key, value = item.split(":", 1)
        key = key.strip().strip('"').strip("'")
        value = value.strip()
        if "+" in value:
            left, right = value.split("+", 1)
            value = str(int(left.strip()) + int(right.strip()))
        entries.append((key, int(value)))

    forms_index = {key: value for key, value in entries}
    (STATS_DIR / "forms_index.json").write_text(
        json.dumps(forms_index, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def main():
    print("Starting core data update...")
    ensure_directories()
    prune_usage_files()

    for source in TEXT_SOURCES:
        write_text_source(*source)

    extract_forms_index()

    for source in BINARY_SOURCES:
        write_binary_source(*source)

    print("Core data update completed.")


if __name__ == "__main__":
    main()
