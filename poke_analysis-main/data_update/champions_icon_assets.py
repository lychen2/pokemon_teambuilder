import json
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from time import sleep
from pathlib import Path
from urllib.parse import urlparse

import requests

from .champions import normalize_showdown_id
from .io import json_dumps, load_json, load_json5_object
from .paths import CHAMPIONS_ICON_ASSET_DIR, CHAMPIONS_ICON_ASSET_MANIFEST_PATH, STATS_DIR

POKEBASE_ROOT = "https://pokebase.app/pokemon-champions"
POKEMON_PAGE_URL = f"{POKEBASE_ROOT}/pokemon"
ITEMS_PAGE_URL = f"{POKEBASE_ROOT}/items"
USER_AGENT = "poke-type-data-updater/1.0"
NEXT_DATA_CHUNK_PATTERN = re.compile(r'self\.__next_f\.push\(\[1,"((?:\\.|[^"\\])*)"\]\)')
FORME_LABEL_ALIASES = {
    "Alola": "Alolan",
    "Galar": "Galarian",
    "Hisui": "Hisuian",
    "Paldea": "Paldean",
}
POKEBASE_SLUG_PART_ALIASES = {
    "alola": "alola",
    "galar": "galar",
    "hisui": "hisui",
    "paldea": "paldea",
    "mega": "mega",
}
POKEBASE_SLUG_ALIASES = {
    "aegislash-shield": "aegislash",
    "basculegion-female": "basculegionf",
    "basculin-red-striped": "basculin",
    "darmanitan-galar-standard": "darmanitangalar",
    "darmanitan-standard": "darmanitan",
    "deoxys-normal": "deoxys",
    "dudunsparce-two-segment": "dudunsparce",
    "eiscue-ice": "eiscue",
    "enamorus-incarnate": "enamorus",
    "frillish-male": "frillish",
    "giratina-altered": "giratina",
    "gourgeist-average": "gourgeist",
    "greninja-battle-bond": "greninjabond",
    "indeedee-female": "indeedeef",
    "indeedee-male": "indeedee",
    "jellicent-male": "jellicent",
    "keldeo-ordinary": "keldeo",
    "landorus-incarnate": "landorus",
    "lycanroc-midday": "lycanroc",
    "marowak-totem": "marowakalolatotem",
    "maushold-family-of-four": "mausholdfour",
    "maushold-family-of-three": "maushold",
    "meloetta-aria": "meloetta",
    "meowstic-female": "meowsticf",
    "meowstic-male": "meowstic",
    "meowstic-mega": "meowsticmega",
    "mimikyu-disguised": "mimikyu",
    "mimikyu-totem-disguised": "mimikyutotem",
    "minior-red": "minior",
    "minior-red-meteor": "miniormeteor",
    "morpeko-full-belly": "morpeko",
    "necrozma-dawn": "necrozmadawnwings",
    "necrozma-dusk": "necrozmaduskmane",
    "ogerpon-cornerstone-mask": "ogerponcornerstone",
    "ogerpon-hearthflame-mask": "ogerponhearthflame",
    "ogerpon-wellspring-mask": "ogerponwellspring",
    "oinkologne-female": "oinkolognef",
    "oinkologne-male": "oinkologne",
    "oricorio-baile": "oricorio",
    "palafin-zero": "palafin",
    "pumpkaboo-average": "pumpkaboo",
    "pyroar-male": "pyroar",
    "raticate-totem-alola": "raticatealolatotem",
    "rockruff-own-tempo": "rockruffdusk",
    "shaymin-land": "shaymin",
    "squawkabilly-blue-plumage": "squawkabillyblue",
    "squawkabilly-green-plumage": "squawkabilly",
    "squawkabilly-white-plumage": "squawkabillywhite",
    "squawkabilly-yellow-plumage": "squawkabillyyellow",
    "tatsugiri-curly": "tatsugiri",
    "tauros-paldea": "taurospaldeacombat",
    "tauros-paldea-aqua-breed": "taurospaldeaaqua",
    "tauros-paldea-blaze-breed": "taurospaldeablaze",
    "thundurus-incarnate": "thundurus",
    "tornadus-incarnate": "tornadus",
    "toxtricity-amped": "toxtricity",
    "toxtricity-amped-gmax": "toxtricitygmax",
    "urshifu-single-strike": "urshifu",
    "urshifu-single-strike-gmax": "urshifugmax",
    "wishiwashi-solo": "wishiwashi",
    "wormadam-plant": "wormadam",
    "zygarde-10-power-construct": "zygarde10",
    "zygarde-50": "zygarde",
    "zygarde-50-power-construct": "zygardecomplete",
    "meowstic-mega": "meowsticmmega",
}




def sync_champions_icon_assets(champions_payload):
    print("Syncing Champions official icons.")
    CHAMPIONS_ICON_ASSET_DIR.mkdir(parents=True, exist_ok=True)
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT, "Accept-Encoding": "identity"})

    pokedex = load_json(STATS_DIR / "pokedex.json")
    items = load_json5_object(STATS_DIR / "items.json")
    species_lookup = build_species_lookup(pokedex)
    item_lookup = build_named_lookup(items)
    existing_manifest = load_existing_manifest()

    pokemon_entries = collect_entries(session, POKEMON_PAGE_URL, species_lookup, "pokemon")
    item_entries = collect_entries(session, ITEMS_PAGE_URL, item_lookup, "items")

    download_entries(session, pokemon_entries, existing_manifest.get("pokemon", {}), CHAMPIONS_ICON_ASSET_DIR / "pokemon")
    download_entries(session, item_entries, existing_manifest.get("items", {}), CHAMPIONS_ICON_ASSET_DIR / "items")
    attach_image_metadata(pokemon_entries)
    attach_image_metadata(item_entries)

    strip_source_paths(pokemon_entries)
    strip_source_paths(item_entries)
    payload = {
        "info": {
            "source": "pokebase.app/pokemon-champions",
            "pokemonPage": POKEMON_PAGE_URL,
            "itemsPage": ITEMS_PAGE_URL,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "pokemonCount": len(pokemon_entries),
            "itemCount": len(item_entries),
        },
        "pokemon": pokemon_entries,
        "items": item_entries,
    }
    write_json_atomic(CHAMPIONS_ICON_ASSET_MANIFEST_PATH, payload)
    return payload


def write_json_atomic(path, payload):
    temporary_path = path.with_suffix(f"{path.suffix}.tmp")
    temporary_path.write_text(json_dumps(payload), encoding="utf-8")
    temporary_path.replace(path)


def load_existing_manifest():
    if not CHAMPIONS_ICON_ASSET_MANIFEST_PATH.exists():
        return {"pokemon": {}, "items": {}}
    return load_json(CHAMPIONS_ICON_ASSET_MANIFEST_PATH)


def collect_entries(session, page_url, lookup, asset_kind):
    response = session.get(page_url, timeout=60)
    response.raise_for_status()
    entries = {}
    for document in extract_next_docs(response.text):
        icon = document.get("icon") if isinstance(document, dict) else None
        source_url = icon.get("url") if isinstance(icon, dict) else None
        label = str(document.get("name") or "").strip()
        slug = str(document.get("slug") or "").strip()
        if not source_url or not label:
            continue
        asset_id = resolve_asset_id(label, slug, lookup)
        if not asset_id:
            asset_id = normalize_showdown_id(slug or label)
        file_name = build_file_name(asset_id, source_url)
        entries[asset_id] = {
            "name": label,
            "file": f"champions-official-icons/{asset_kind}/{file_name}",
            "sourceUrl": source_url,
            "sourcePath": str(CHAMPIONS_ICON_ASSET_DIR / asset_kind / file_name),
            "assetKind": asset_kind,
        }
    if not entries:
        raise ValueError(f"No Champions official {asset_kind} icons found at {page_url}")
    return dict(sorted(entries.items()))


def extract_next_docs(page_text):
    decoded = "".join(json.loads(f'"{match.group(1)}"') for match in NEXT_DATA_CHUNK_PATTERN.finditer(page_text))
    marker = '"data":{"docs":'
    start = decoded.find(marker)
    if start < 0:
        raise ValueError("PokéBase docs payload not found")
    docs, _ = json.JSONDecoder().raw_decode(decoded[start + len(marker):])
    if not isinstance(docs, list):
        raise ValueError("PokéBase docs payload is not a list")
    return docs


def resolve_asset_id(label, slug, lookup):
    candidates = [label, slug, POKEBASE_SLUG_ALIASES.get(slug), normalize_pokebase_slug(slug)]
    for candidate in candidates:
        asset_id = lookup.get(normalize_identifier(candidate))
        if asset_id:
            return asset_id
    return None


def normalize_pokebase_slug(slug):
    parts = [part for part in str(slug or "").split("-") if part]
    if len(parts) <= 1:
        return slug
    if "mega" in parts:
        mega_index = parts.index("mega")
        base = "".join(parts[:mega_index])
        suffix = "".join(parts[mega_index + 1:])
        return f"{base}mega{suffix}"
    base = "".join(part for part in parts if part not in POKEBASE_SLUG_PART_ALIASES)
    suffix = "".join(part for part in parts if part in POKEBASE_SLUG_PART_ALIASES)
    return f"{base}{suffix}"


def download_entries(session, entries, existing_entries, destination):
    destination.mkdir(parents=True, exist_ok=True)
    pending = []
    for entry_id, entry in entries.items():
        destination_path = Path(entry["sourcePath"])
        previous = existing_entries.get(entry_id, {})
        if destination_path.exists() and previous.get("sourceUrl") == entry["sourceUrl"] and is_supported_image_file(destination_path):
            continue
        pending.append((entry["sourceUrl"], destination_path))
    if not pending:
        return
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = [executor.submit(download_icon, source_url, destination_path) for source_url, destination_path in pending]
        for future in as_completed(futures):
            future.result()


def download_icon(source_url, destination_path):
    last_error = None
    for attempt in range(4):
        try:
            response = requests.get(source_url, headers={"User-Agent": USER_AGENT}, timeout=60)
            response.raise_for_status()
            content = response.content
            if not is_supported_image_content(content):
                raise ValueError(f"Downloaded icon is not a supported image: {source_url}")
            destination_path.write_bytes(content)
            return
        except (requests.RequestException, ValueError) as error:
            last_error = error
            sleep(0.5 * (attempt + 1))
    raise last_error


def is_supported_image_content(content):
    return is_png_content(content) or content.startswith(b"RIFF") and content[8:12] == b"WEBP" or content.lstrip().startswith(b"<svg")


def is_png_content(content):
    return len(content) >= 24 and content[:8] == b"\x89PNG\r\n\x1a\n"


def is_supported_image_file(path):
    try:
        return is_supported_image_content(path.read_bytes()[:32])
    except OSError:
        return False


def png_size(path):
    try:
        header = path.read_bytes()[:24]
    except OSError:
        return None
    if not is_png_content(header):
        return None
    return int.from_bytes(header[16:20], "big"), int.from_bytes(header[20:24], "big")


def attach_image_metadata(entries):
    for entry in entries.values():
        size = png_size(Path(entry["sourcePath"]))
        if size:
            entry["width"], entry["height"] = size
        entry["lowResolution"] = entry.get("assetKind") == "items" and size is not None and min(size) < 64


def strip_source_paths(entries):
    for entry in entries.values():
        entry.pop("sourcePath", None)


def build_named_lookup(entries):
    lookup = {}
    for entry_id, entry in entries.items():
        lookup[normalize_identifier(entry_id)] = entry_id
        lookup[normalize_identifier(entry.get("name"))] = entry_id
    return lookup


def build_species_lookup(pokedex):
    lookup = build_named_lookup(pokedex)
    for species_id, entry in pokedex.items():
        name = entry.get("name") or species_id
        add_form_aliases(lookup, species_id, name)
        add_mega_aliases(lookup, species_id, name)
    return lookup


def add_form_aliases(lookup, species_id, name):
    parts = str(name or "").split("-")
    if len(parts) != 2:
        return
    base_name, forme_name = parts
    lookup[normalize_identifier(f"{forme_name} {base_name}")] = species_id
    alias_forme_name = FORME_LABEL_ALIASES.get(forme_name)
    if alias_forme_name:
        lookup[normalize_identifier(f"{alias_forme_name} {base_name}")] = species_id


def add_mega_aliases(lookup, species_id, name):
    parts = str(name or "").split("-Mega")
    if len(parts) != 2:
        return
    base_name = parts[0].strip()
    suffix = parts[1].strip("-")
    alias = f"Mega {base_name} {suffix}".strip()
    lookup[normalize_identifier(alias)] = species_id


def build_file_name(entry_id, source_url):
    parsed = urlparse(source_url)
    suffix = Path(parsed.path).suffix or ".png"
    return f"{normalize_showdown_id(entry_id)}{suffix}"


def normalize_identifier(value):
    return re.sub(r"[^a-z0-9]", "", str(value or "").lower())
