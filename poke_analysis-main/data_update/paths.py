from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STATS_DIR = ROOT / "poke_analysis-main" / "stats"
STATIC_DIR = ROOT / "static"
LOCALIZATION_BUILD_SCRIPT = ROOT / "tools" / "build-localization-data.mjs"
DEFAULT_PRESET_SCRIPT = ROOT / "poke_analysis-main" / "build_default_preset.py"

STATIC_USAGE_PATH = STATIC_DIR / "usage.json"
CHAMPIONS_VGC_PATH = STATS_DIR / "champions_vgc.json"

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
FORMATS_SOURCE = "https://play.pokemonshowdown.com/data/formats.js"
TEAMBUILDER_SOURCE = "https://play.pokemonshowdown.com/data/teambuilder-tables.js"
LEARNSETS_SOURCE = "https://play.pokemonshowdown.com/data/learnsets.js"
