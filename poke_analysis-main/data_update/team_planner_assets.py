import json
import re
import shutil
import subprocess
import tempfile
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from .io import load_json, write_json
from .paths import TEAM_PLANNER_ASSET_DIR, TEAM_PLANNER_ASSET_MANIFEST_PATH, STATS_DIR

REPO_URL = "https://github.com/richi3f/pokemon-team-planner.git"
REPO_WEB_URL = "https://github.com/richi3f/pokemon-team-planner"
RAW_ROOT = "https://raw.githubusercontent.com/richi3f/pokemon-team-planner/master"
POKEMON_METADATA_PATH = "static/js/pokemon.js"
POKEMON_DIR = "static/img/pokemon"
TYPE_DIR = "static/img/type"
CLONE_TIMEOUT_SECONDS = 180

POKEMON_ICON_PATTERN = re.compile(r"^(?P<num>\d{4})_(?P<form>\d{3})_(?P<gender>[a-z]{2})_(?P<kind>[ng])\.png$")


def sync_team_planner_assets(champions_payload):
    print("Syncing pokemon-team-planner icons.")
    TEAM_PLANNER_ASSET_DIR.mkdir(parents=True, exist_ok=True)
    pokedex = load_json(STATS_DIR / "pokedex.json")
    forms_index = load_json(STATS_DIR / "forms_index.json")
    usable_ids = champions_payload.get("usableSpeciesIds") or []

    with checkout_team_planner_repo() as repo_root:
        pokemon_files = local_asset_entries(repo_root / POKEMON_DIR, POKEMON_DIR)
        type_files = local_asset_entries(repo_root / TYPE_DIR, TYPE_DIR)
        planner_metadata = parse_team_planner_pokemon_metadata(
            (repo_root / POKEMON_METADATA_PATH).read_text(encoding="utf-8")
        )
        pokemon_manifest = build_pokemon_manifest(pokedex, forms_index, usable_ids, pokemon_files, planner_metadata)
        type_manifest = build_type_manifest(type_files)
        copy_manifest_assets(pokemon_manifest, TEAM_PLANNER_ASSET_DIR / "pokemon")
        copy_manifest_assets(type_manifest, TEAM_PLANNER_ASSET_DIR / "type")
        remove_manifest_source_paths(pokemon_manifest)
        remove_manifest_source_paths(type_manifest)

    payload = {
        "info": {
            "source": "richi3f/pokemon-team-planner",
            "repo": REPO_WEB_URL,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "pokemonCount": len(pokemon_manifest),
            "typeIconCount": len(type_manifest),
        },
        "pokemon": pokemon_manifest,
        "types": type_manifest,
    }
    write_json(TEAM_PLANNER_ASSET_MANIFEST_PATH, payload)
    return payload


@contextmanager
def checkout_team_planner_repo():
    with tempfile.TemporaryDirectory() as temp_dir:
        repo_path = Path(temp_dir) / "pokemon-team-planner"
        subprocess.run(
            ["git", "clone", "--depth", "1", REPO_URL, str(repo_path)],
            check=True,
            timeout=CLONE_TIMEOUT_SECONDS,
        )
        yield repo_path


def local_asset_entries(directory: Path, relative_directory: str):
    return [
        {
            "name": path.name,
            "sourcePath": str(path),
            "sourceUrl": f"{RAW_ROOT}/{relative_directory}/{path.name}",
        }
        for path in sorted(directory.iterdir())
        if path.is_file()
    ]


def parse_team_planner_pokemon_metadata(text):
    normalized = re.sub(r"^\s*export\s+default\s+", "", text.strip())
    normalized = normalized.rstrip(";\n ")
    normalized = re.sub(r"([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)(\s*:)", r'\1"\2"\3', normalized)
    normalized = normalized.replace("undefined", "null")
    return json.loads(normalized)


def build_pokemon_manifest(pokedex, forms_index, usable_ids, files, planner_metadata=None):
    by_num = group_pokemon_files(files)
    species_ids = [species_id for species_id in usable_ids if species_id in pokedex]
    planner_lookup = build_planner_species_lookup(planner_metadata or {})
    manifest = {}
    for species_id in species_ids:
        entry = pokedex.get(species_id) or {}
        dex_num = int(entry.get("num") or forms_index.get(species_id) or 0)
        if dex_num <= 0:
            continue
        icon_request = resolve_icon_request(species_id, entry, pokedex, planner_lookup)
        selected = select_pokemon_icon(by_num.get(icon_request["dexNumber"] or dex_num, []), icon_request)
        if not selected:
            selected = select_pokemon_icon(by_num.get(dex_num, []), {"formId": 0, "kind": "n", "gender": []})
        if not selected:
            continue
        local_path = f"team-planner-assets/pokemon/{selected['name']}"
        manifest[species_id] = {
            "speciesName": entry.get("name") or species_id,
            "dexNumber": dex_num,
            "formId": icon_request["formId"],
            "file": local_path,
            "sourceUrl": selected["sourceUrl"],
            "sourcePath": selected["sourcePath"],
        }
    return manifest




def build_planner_species_lookup(planner_metadata):
    lookup = {}
    for planner_id, entry in planner_metadata.items():
        normalized = normalize_identifier(planner_id)
        if normalized:
            lookup[normalized] = entry
    return lookup


def resolve_icon_request(species_id, entry, pokedex, planner_lookup):
    planner_entry = planner_lookup.get(species_id.lower())
    if planner_entry:
        return {
            "dexNumber": int(planner_entry.get("base_id") or entry.get("num") or 0),
            "formId": int(planner_entry.get("form_id") or 0),
            "gender": planner_entry.get("gender") or [],
            "kind": "g" if str(species_id).endswith("gmax") else "n",
        }
    return {
        "dexNumber": int(entry.get("num") or 0),
        "formId": infer_form_id(species_id, entry, pokedex),
        "gender": [],
        "kind": "g" if str(species_id).endswith("gmax") else "n",
    }


def infer_form_id(species_id, entry, pokedex):
    if str(entry.get("forme", "")).lower() == "gmax" or str(species_id).endswith("gmax"):
        return 0
    base_name = entry.get("baseSpecies")
    if not base_name:
        return 0
    base_entry = pokedex.get(normalize_identifier(base_name), {})
    form_order = base_entry.get("formeOrder") or [base_entry.get("name") or base_name]
    try:
        return form_order.index(entry.get("name"))
    except ValueError:
        return 0


def normalize_identifier(value):
    return re.sub(r"[^a-z0-9]", "", str(value or "").lower())


def group_pokemon_files(files):
    grouped = {}
    for file_entry in files:
        name = file_entry.get("name", "")
        match = POKEMON_ICON_PATTERN.match(name)
        if not match:
            continue
        grouped.setdefault(int(match.group("num")), []).append(file_entry)
    for entries in grouped.values():
        entries.sort(key=lambda entry: icon_sort_key(entry.get("name", "")))
    return grouped


def icon_sort_key(name):
    match = POKEMON_ICON_PATTERN.match(name)
    if not match:
        return (999, name)
    form = int(match.group("form"))
    kind = 0 if match.group("kind") == "n" else 1
    gender = {"mf": 0, "fd": 1, "md": 2, "fo": 3, "mo": 4, "uk": 5}.get(match.group("gender"), 9)
    return (form, kind, gender, name)


def select_pokemon_icon(entries, request):
    if not entries:
        return None
    form_id = int(request.get("formId") or 0)
    kind = request.get("kind") or "n"
    requested_genders = list(request.get("gender") or [])
    candidates = [entry for entry in entries if icon_metadata(entry.get("name", ""))["formId"] == form_id]
    candidates = [entry for entry in candidates if icon_metadata(entry.get("name", ""))["kind"] == kind] or candidates
    if requested_genders:
        gendered = [entry for entry in candidates if icon_metadata(entry.get("name", ""))["gender"] in requested_genders]
        if gendered:
            candidates = gendered
    return candidates[0] if candidates else None


def icon_metadata(name):
    match = POKEMON_ICON_PATTERN.match(name)
    if not match:
        return {"formId": -1, "gender": "", "kind": ""}
    return {
        "formId": int(match.group("form")),
        "gender": match.group("gender"),
        "kind": match.group("kind"),
    }


def build_type_manifest(files):
    manifest = {}
    for file_entry in files:
        name = file_entry.get("name", "")
        if not name.endswith(".png") or "_" in name:
            continue
        type_id = name.removesuffix(".png")
        local_path = f"team-planner-assets/type/{name}"
        manifest[type_id] = {
            "file": local_path,
            "sourceUrl": file_entry["sourceUrl"],
            "sourcePath": file_entry["sourcePath"],
        }
    return manifest


def remove_manifest_source_paths(manifest):
    for entry in manifest.values():
        entry.pop("sourcePath", None)


def copy_manifest_assets(manifest, destination):
    destination.mkdir(parents=True, exist_ok=True)
    copied = set()
    for entry in manifest.values():
        source = Path(entry["sourcePath"])
        target = destination / source.name
        if target.name in copied:
            continue
        copied.add(target.name)
        shutil.copyfile(source, target)
