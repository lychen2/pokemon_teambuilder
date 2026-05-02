import re

from .io import fetch_text, parse_exported_array, parse_exported_object, write_json
from .paths import FORMS_SOURCE, FORMATS_SOURCE, LEARNSETS_SOURCE, STATS_DIR


def write_text_source(url, destination, label):
    print(f"Updating {label}.")
    content = fetch_text(url)
    if destination.name in {"items.json", "abilities.json"}:
        content = "{" + content.split("{", 1)[1][:-1]
    destination.write_text(content, encoding="utf-8")


def write_formats_data():
    print("Updating formats.")
    formats = parse_exported_array(fetch_text(FORMATS_SOURCE), "Formats")
    write_json(STATS_DIR / "formats.json", formats)
    return formats


def write_learnsets_data():
    print("Updating learnsets.")
    learnsets = parse_exported_object(fetch_text(LEARNSETS_SOURCE), "BattleLearnsets")
    write_json(STATS_DIR / "learnsets.json", learnsets)


def extract_forms_index():
    print("Updating forms index.")
    content = fetch_text(FORMS_SOURCE)
    match = re.search(r"BattlePokemonIconIndexes\s*=\s*\{(.*?)\n\};", content, re.DOTALL)
    if not match:
        raise ValueError("BattlePokemonIconIndexes not found in battle-dex-data.js")
    write_json(STATS_DIR / "forms_index.json", parse_icon_index_body(match.group(1)))


def parse_icon_index_body(raw_body):
    entries = []
    for part in raw_body.replace("\t", " ").split(","):
        item = part.strip()
        if not item:
            continue
        key, value = item.split(":", 1)
        entries.append((clean_icon_key(key), parse_icon_value(value)))
    return {key: value for key, value in entries}


def clean_icon_key(value):
    return value.strip().strip('"').strip("'")


def parse_icon_value(value):
    text = value.strip()
    if "+" not in text:
        return int(text)
    left, right = text.split("+", 1)
    return int(left.strip()) + int(right.strip())
