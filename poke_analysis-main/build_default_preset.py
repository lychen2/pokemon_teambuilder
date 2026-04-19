#!/usr/bin/env python3
"""Build config-default.txt by merging yakkun.com EV/nature data with usage.json
item / ability / move frequencies. Run manually: python poke_analysis-main/build_default_preset.py
"""

import argparse
import json
import random
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
STATS_DIR = ROOT / "poke_analysis-main" / "stats"
STATIC_DIR = ROOT / "static"
USAGE_PATH = STATIC_DIR / "usage.json"
POKEDEX_PATH = STATS_DIR / "pokedex.json"
ITEMS_PATH = STATS_DIR / "items.json"
ABILITIES_PATH = STATS_DIR / "abilities.json"
MOVES_PATH = STATS_DIR / "moves.json"
CHAMPIONS_VGC_PATH = STATS_DIR / "champions_vgc.json"
CACHE_PATH = STATS_DIR / "yakkun_cache.json"
OUTPUT_PATH = ROOT / "config-default.txt"

YAKKUN_URL_TEMPLATE = "https://yakkun.com/ch/theory/p{key}/?rule=1"
USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
REQUEST_DELAY = (1.0, 1.8)
RETRY_PASSES = 3
RETRY_PASS_DELAY = 10.0

NATURE_JP_TO_EN = {
    "がんばりや": "Hardy", "さみしがり": "Lonely", "ゆうかん": "Brave",
    "いじっぱり": "Adamant", "やんちゃ": "Naughty", "ずぶとい": "Bold",
    "すなお": "Docile", "のんき": "Relaxed", "わんぱく": "Impish",
    "のうてんき": "Lax", "おくびょう": "Timid", "せっかち": "Hasty",
    "まじめ": "Serious", "ようき": "Jolly", "むじゃき": "Naive",
    "ひかえめ": "Modest", "おっとり": "Mild", "うっかりや": "Rash",
    "れいせい": "Quiet", "てれや": "Bashful", "おだやか": "Calm",
    "おとなしい": "Gentle", "しんちょう": "Careful", "なまいき": "Sassy",
    "きまぐれ": "Quirky",
}

NATURE_EFFECT = {
    "Hardy": (None, None), "Docile": (None, None), "Serious": (None, None),
    "Bashful": (None, None), "Quirky": (None, None),
    "Lonely": ("atk", "def"), "Brave": ("atk", "spe"),
    "Adamant": ("atk", "spa"), "Naughty": ("atk", "spd"),
    "Bold": ("def", "atk"), "Relaxed": ("def", "spe"),
    "Impish": ("def", "spa"), "Lax": ("def", "spd"),
    "Timid": ("spe", "atk"), "Hasty": ("spe", "def"),
    "Jolly": ("spe", "spa"), "Naive": ("spe", "spd"),
    "Modest": ("spa", "atk"), "Mild": ("spa", "def"),
    "Quiet": ("spa", "spe"), "Rash": ("spa", "spd"),
    "Calm": ("spd", "atk"), "Gentle": ("spd", "def"),
    "Careful": ("spd", "spa"), "Sassy": ("spd", "spe"),
}

STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"]
STAT_LABELS = {"hp": "HP", "atk": "Atk", "def": "Def", "spa": "SpA", "spd": "SpD", "spe": "Spe"}
JP_LABEL_TO_KEY = {"HP": "hp", "攻撃": "atk", "防御": "def", "特攻": "spa", "特防": "spd", "素早": "spe"}

# Maps (normalized_base, normalized_form) -> yakkun URL form suffix.
# Same letter means different things across species (e.g. 'f' is Female for
# Meowstic / Basculegion, Frost for Rotom, Midnight for Lycanroc). Keep entries
# species-scoped only.
FORM_TO_YAKKUN_SUFFIX = {
    ("rotom", "wash"): "w",
    ("rotom", "heat"): "h",
    ("rotom", "mow"): "c",
    ("rotom", "frost"): "f",
    ("rotom", "fan"): "s",
    ("lycanroc", "dusk"): "d",
    ("lycanroc", "midnight"): "f",
    ("tauros", "paldeacombat"): "a",
    ("tauros", "paldeablaze"): "b",
    ("tauros", "paldeaaqua"): "c",
    ("ninetales", "alola"): "a",
    ("raichu", "alola"): "a",
    ("persian", "alola"): "a",
    ("slowking", "galar"): "g",
    ("slowbro", "galar"): "g",
    ("arcanine", "hisui"): "h",
    ("zoroark", "hisui"): "h",
    ("avalugg", "hisui"): "h",
    ("typhlosion", "hisui"): "h",
    ("goodra", "hisui"): "h",
    ("samurott", "hisui"): "h",
    ("decidueye", "hisui"): "h",
    ("meowstic", "f"): "f",
    ("basculegion", "f"): "f",
    ("floette", "eternal"): "e",
}

# yakkun assigned its own internal IDs for Gen 9 Paldean Pokemon that
# diverge from the PS national dex (probed via https://yakkun.com/ch/zukan/).
# Maps national dex num -> yakkun internal num when they differ.
NATIONAL_TO_YAKKUN_NUM = {
    925: 946,    # Maushold
    936: 1004,   # Armarouge
    937: 1005,   # Ceruledge
    952: 939,    # Scovillain
    956: 927,    # Espathra
    959: 1002,   # Tinkaton
    964: 934,    # Palafin
    968: 944,    # Orthworm
    970: 967,    # Glimmora
    981: 928,    # Farigiraf
    983: 1008,   # Kingambit
    1018: 1023,  # Archaludon
    1019: 1013,  # Hydrapple
}


def normalize_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (name or "").lower())


def json5_to_json(text: str) -> str:
    return re.sub(r"([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)(\s*:)", r'\1"\2"\3', text)


def load_json5_object(path: Path) -> dict:
    return json.loads(json5_to_json(path.read_text(encoding="utf-8")))


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def load_cache() -> dict:
    if CACHE_PATH.exists():
        try:
            return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            pass
    return {}


def save_cache(cache: dict) -> None:
    CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")


def fetch_yakkun(url_key: str, session: requests.Session) -> Optional[str]:
    url = YAKKUN_URL_TEMPLATE.format(key=url_key)
    try:
        resp = session.get(url, timeout=30)
    except requests.RequestException as exc:
        print(f"  [net] p{url_key}: {exc}")
        return None
    if resp.status_code != 200:
        print(f"  [http] p{url_key}: status {resp.status_code}")
        return None
    try:
        html = resp.content.decode("euc_jp", errors="replace")
    except LookupError:
        html = resp.text
    if "Just a moment" in html[:1000]:
        print(f"  [cf] p{url_key}: Cloudflare challenge")
        return None
    if "能力ポイント" not in html and "努力値" not in html:
        print(f"  [empty] p{url_key}: no EV section")
        return None
    return html


def parse_yakkun(html: str):
    soup = BeautifulSoup(html, "html.parser")
    nature_ul = None
    ev_ul = None
    for h3 in soup.find_all("h3"):
        text = h3.get_text(strip=True)
        if text == "性格" and nature_ul is None:
            nature_ul = h3.find_next("ul", class_="adoption_list")
        elif "能力ポイント" in text and ev_ul is None:
            ev_ul = h3.find_next("ul", class_="adoption_list")

    top_nature_jp = None
    top_nature_ratio = -1.0
    if nature_ul:
        for li in nature_ul.find_all("li", class_="adoption_bar"):
            anchor = li.find("a")
            ratio_el = li.find("span", class_="ratio")
            if not (anchor and ratio_el):
                continue
            try:
                ratio = float(ratio_el.get_text(strip=True).rstrip("%"))
            except ValueError:
                continue
            if ratio > top_nature_ratio:
                top_nature_ratio = ratio
                top_nature_jp = anchor.get_text(strip=True)

    ev_candidates = []
    if ev_ul:
        for li in ev_ul.find_all("li", class_="adoption_bar"):
            ratio_el = li.find("span", class_="ratio")
            ev_list = li.find("div", class_="ev_list")
            if not (ratio_el and ev_list):
                continue
            try:
                ratio = float(ratio_el.get_text(strip=True).rstrip("%"))
            except ValueError:
                continue
            pts = {}
            for div in ev_list.find_all("div", recursive=False):
                label_el = div.find("span", class_="stats_label")
                value_el = div.find("span", class_="value")
                if not (label_el and value_el):
                    continue
                key = JP_LABEL_TO_KEY.get(label_el.get_text(strip=True))
                if not key:
                    continue
                try:
                    pts[key] = int(value_el.get_text(strip=True))
                except ValueError:
                    pts[key] = 0
            if len(pts) == 6:
                ev_candidates.append((ratio, pts))

    if not top_nature_jp or not ev_candidates:
        return None

    nature_en = NATURE_JP_TO_EN.get(top_nature_jp, "Hardy")
    sorted_candidates = sorted(ev_candidates, key=lambda item: -item[0])
    above_threshold = [(r, p) for r, p in sorted_candidates if r >= 10.0]
    if above_threshold:
        spreads = above_threshold
    else:
        spreads = sorted_candidates[:1]
    return {
        "nature": nature_en,
        "top_nature_ratio": top_nature_ratio,
        "spreads": [{"points": pts, "ratio": ratio} for ratio, pts in spreads],
    }


def _nature_match_score(points: dict, plus_stat: str, minus_stat: str) -> int:
    return points.get(plus_stat, 0) - points.get(minus_stat, 0)


def build_pokedex_lookup(pokedex: dict) -> dict:
    out = {}
    for key, entry in pokedex.items():
        num = entry.get("num")
        name = entry.get("name") or key
        if not num:
            continue
        record = {"num": num, "name": name}
        for candidate in (key, name):
            norm = normalize_name(candidate)
            if norm and norm not in out:
                out[norm] = record
    return out


def resolve_pokemon(display_name: str, pokedex_lookup: dict) -> Optional[dict]:
    norm = normalize_name(display_name)
    if norm in pokedex_lookup:
        return pokedex_lookup[norm]
    # handle gender form suffixes: e.g. "Basculegion-F"
    stripped = re.sub(r"(female|male)$", "", norm) or norm
    if stripped != norm and stripped in pokedex_lookup:
        return pokedex_lookup[stripped]
    return None


def build_lookup(data: dict) -> dict:
    out = {}
    for key, entry in data.items():
        if not isinstance(entry, dict):
            continue
        name = entry.get("name")
        if not name:
            continue
        for candidate in (key, name):
            norm = normalize_name(candidate)
            if norm and norm not in out:
                out[norm] = name
    return out


def build_mega_stone_lookup(items: dict) -> dict:
    """Map normalized mega-stone id → {'mega_species': 'Venusaur-Mega', 'base': 'Venusaur'}."""
    out = {}
    for key, entry in items.items():
        if not isinstance(entry, dict):
            continue
        mega_map = entry.get("megaStone")
        if not mega_map:
            continue
        # megaStone example: {"Venusaur": "Venusaur-Mega"}
        base, mega = next(iter(mega_map.items()))
        stone_name = entry.get("name")
        for candidate in (key, stone_name):
            norm = normalize_name(candidate)
            if norm and norm not in out:
                out[norm] = {"mega_species": mega, "base": base}
    return out


def build_ability_for_species(species_name: str, pokedex: dict) -> Optional[str]:
    """Lookup the Mega form's primary ability from pokedex.json."""
    key = normalize_name(species_name)
    entry = pokedex.get(key)
    if not entry:
        return None
    abilities = entry.get("abilities") or {}
    # Prefer slot "0" (primary)
    return abilities.get("0") or abilities.get("H") or next(iter(abilities.values()), None)


def yakkun_url_key(display_name: str, base_num: int) -> str:
    """Derive yakkun URL key (e.g. '479w') from a Pokemon display name."""
    yakkun_num = NATIONAL_TO_YAKKUN_NUM.get(base_num, base_num)
    parts = display_name.split("-", 1)
    if len(parts) == 1:
        return str(yakkun_num)
    base_norm = normalize_name(parts[0])
    form_norm = normalize_name(parts[1])
    suffix = FORM_TO_YAKKUN_SUFFIX.get((base_norm, form_norm), "")
    return f"{yakkun_num}{suffix}"


def top_from_dict(data: dict, lookup: dict, limit: int = 1) -> list:
    if not data:
        return []
    ranked = sorted(data.items(), key=lambda kv: -float(kv[1] or 0))
    results = []
    seen = set()
    for raw_key, _count in ranked:
        resolved = lookup.get(normalize_name(raw_key))
        if not resolved or resolved in seen:
            continue
        seen.add(resolved)
        results.append(resolved)
        if len(results) >= limit:
            break
    return results


def format_preset_block(species: str, item: str, ability: str,
                        points: dict, nature: str, moves: list,
                        note: str = "") -> str:
    lines = [f"{species} @ {item}" if item else species]
    if ability:
        lines.append(f"Ability: {ability}")
    lines.append("Level: 50")
    if note:
        lines.append(f"Note: {note}")
    lines.append(
        "Points: "
        + " / ".join(f"{points.get(k, 0)} {STAT_LABELS[k]}" for k in STAT_KEYS)
    )
    lines.append(f"{nature} Nature")
    for move in moves[:4]:
        lines.append(f"- {move}")
    return "\n".join(lines)


def polite_sleep():
    time.sleep(random.uniform(*REQUEST_DELAY))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true",
                        help="Ignore cache; refetch all yakkun pages")
    parser.add_argument("--limit", type=int, default=0,
                        help="Only process first N Pokemon (for quick tests)")
    args = parser.parse_args()

    print("Loading data files...")
    usage = load_json(USAGE_PATH)
    pokedex = load_json(POKEDEX_PATH)
    items = load_json5_object(ITEMS_PATH)
    abilities = load_json5_object(ABILITIES_PATH)
    moves = load_json(MOVES_PATH)
    champions = load_json(CHAMPIONS_VGC_PATH)

    pokedex_lookup = build_pokedex_lookup(pokedex)
    items_lookup = build_lookup(items)
    abilities_lookup = build_lookup(abilities)
    moves_lookup = build_lookup(moves)
    mega_stone_lookup = build_mega_stone_lookup(items)
    usable_species_ids = set(champions.get("usableSpeciesIds") or [])

    usage_data = usage.get("data", {})
    cache = {} if args.refresh else load_cache()

    tasks = []
    missing_dex = []
    illegal = []
    for poke_name, profile in usage_data.items():
        resolved = resolve_pokemon(poke_name, pokedex_lookup)
        if not resolved:
            missing_dex.append(poke_name)
            continue
        norm_key = normalize_name(poke_name)
        if usable_species_ids and norm_key not in usable_species_ids:
            illegal.append(poke_name)
            continue
        url_key = yakkun_url_key(poke_name, int(resolved["num"]))
        tasks.append((poke_name, resolved["name"], url_key, profile))
    if args.limit > 0:
        tasks = tasks[:args.limit]

    print(f"Total: {len(tasks)} pokemon entries "
          f"(missing dex: {len(missing_dex)}, not in current format: {len(illegal)})")
    if missing_dex:
        preview = ", ".join(missing_dex[:10])
        tail = "..." if len(missing_dex) > 10 else ""
        print(f"  Missing dex nums: {preview}{tail}")
    if illegal:
        preview = ", ".join(illegal[:10])
        tail = "..." if len(illegal) > 10 else ""
        print(f"  Not in usableSpeciesIds (skipped): {preview}{tail}")

    session = requests.Session()
    session.headers.update({
        "User-Agent": USER_AGENT,
        "Accept-Language": "ja,en;q=0.8",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9",
    })

    results = {}
    pending = list(tasks)
    for pass_idx in range(RETRY_PASSES):
        if not pending:
            break
        if pass_idx > 0:
            print(f"\nRetry pass {pass_idx + 1}/{RETRY_PASSES} for {len(pending)} items. Sleeping {RETRY_PASS_DELAY}s...")
            time.sleep(RETRY_PASS_DELAY)
        next_pending = []
        for i, (usage_key, species_name, url_key, profile) in enumerate(pending, 1):
            cache_key = url_key
            if cache_key in cache and cache[cache_key].get("html"):
                html = cache[cache_key]["html"]
                source = "cache"
            else:
                html = fetch_yakkun(url_key, session)
                source = "fetch"
                if html:
                    cache[cache_key] = {
                        "html": html,
                        "fetched_at": datetime.now(timezone.utc).isoformat(),
                    }
                    save_cache(cache)
                polite_sleep()
            if not html:
                print(f"  [{pass_idx + 1}] {i}/{len(pending)} FETCH_FAIL {species_name} (p{url_key})")
                next_pending.append((usage_key, species_name, url_key, profile))
                continue
            parsed = parse_yakkun(html)
            if not parsed:
                print(f"  [{pass_idx + 1}] {i}/{len(pending)} PARSE_FAIL {species_name} (p{url_key})")
                # Invalidate cache so the next retry pass refetches from network.
                cache.pop(cache_key, None)
                save_cache(cache)
                next_pending.append((usage_key, species_name, url_key, profile))
                continue
            results[usage_key] = {
                "species_name": species_name,
                "url_key": url_key,
                "profile": profile,
                "yakkun": parsed,
            }
            print(f"  [{pass_idx + 1}] {i}/{len(pending)} OK {species_name} ({source}) -> {parsed['nature']}")
        pending = next_pending

    if pending:
        print(f"\nFailed after {RETRY_PASSES} passes ({len(pending)}):")
        for _, species_name, url_key, _ in pending:
            print(f"  - {species_name} (p{url_key})")

    blocks = []
    skipped_no_data = []
    for usage_key, data in results.items():
        species_name = data["species_name"]
        profile = data["profile"]
        yakkun = data["yakkun"]
        item_list = top_from_dict(profile.get("Items", {}), items_lookup, limit=1)
        ability_list = top_from_dict(profile.get("Abilities", {}), abilities_lookup, limit=1)
        move_list = top_from_dict(profile.get("Moves", {}), moves_lookup, limit=4)
        if not ability_list or not move_list:
            skipped_no_data.append(species_name)
            continue

        item_name = item_list[0] if item_list else ""
        output_species = species_name
        output_ability = ability_list[0]
        if item_name:
            mega_info = mega_stone_lookup.get(normalize_name(item_name))
            if mega_info:
                mega_species = mega_info["mega_species"]
                output_species = mega_species
                mega_ability = build_ability_for_species(mega_species, pokedex)
                if mega_ability:
                    output_ability = mega_ability

        spread_entries = yakkun.get("spreads") or []
        emit_note = len(spread_entries) > 1
        for spread in spread_entries:
            note = f"{spread['ratio']:.1f}% 采用率" if emit_note else ""
            block = format_preset_block(
                species=output_species,
                item=item_name,
                ability=output_ability,
                points=spread["points"],
                nature=yakkun["nature"],
                moves=move_list,
                note=note,
            )
            blocks.append(block)

    if skipped_no_data:
        print(f"\nSkipped (missing ability/move data) {len(skipped_no_data)}:")
        for name in skipped_no_data:
            print(f"  - {name}")

    content = "\n\n".join(blocks) + "\n"
    OUTPUT_PATH.write_text(content, encoding="utf-8")
    print(f"\nWrote {len(blocks)} entries to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
