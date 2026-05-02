import subprocess
import sys

from .champions import write_champions_vgc_data
from .io import fetch_binary_to_file
from .paths import (
    BINARY_SOURCES,
    DEFAULT_PRESET_SCRIPT,
    LOCALIZATION_BUILD_SCRIPT,
    ROOT,
    STATIC_DIR,
    STATS_DIR,
    TEXT_SOURCES,
)
from .showdown_sources import extract_forms_index, write_learnsets_data, write_text_source
from .smogon_usage import update_usage_data


def ensure_directories():
    STATS_DIR.mkdir(parents=True, exist_ok=True)
    STATIC_DIR.mkdir(parents=True, exist_ok=True)


def run_update(skip_assets=False, strict_pastes=False):
    print("Starting core data update...")
    ensure_directories()
    write_core_sources()
    extract_forms_index()
    write_learnsets_data()
    champions_payload = write_champions_vgc_data()
    update_usage_data(champions_payload)
    # Localization must come before any reverse-mapping consumer (none active
    # right now — official-usage scraping is disabled until a reliable data
    # source is identified).
    write_localization_data()
    # refresh_official_usage()  # disabled: pending reliable upstream
    rebuild_default_preset(strict_pastes)
    if not skip_assets:
        write_binary_sources()
    print("Core data update completed.")


def refresh_official_usage():
    """Disabled: pending reliable upstream data source.

    Implementation lives in ``pokechamp_usage.py`` / ``default_preset/pokechamp*``.
    Re-enable by uncommenting the call in ``run_update`` once a trustworthy
    URL is configured.
    """
    print("Skipping official usage refresh: disabled (no reliable upstream).", file=sys.stderr)


def write_core_sources():
    for source in TEXT_SOURCES:
        write_text_source(*source)


def write_binary_sources():
    for source in BINARY_SOURCES:
        fetch_binary_to_file(*source)


def write_localization_data():
    print("Updating localization data.")
    subprocess.run(["node", str(LOCALIZATION_BUILD_SCRIPT)], check=True, cwd=ROOT)


def rebuild_default_preset(strict_pastes=False):
    print("Rebuilding default preset and VGCPastes data.")
    command = [sys.executable, str(DEFAULT_PRESET_SCRIPT)]
    if strict_pastes:
        command.append("--strict-pastes")
    subprocess.run(command, check=True, cwd=ROOT)
