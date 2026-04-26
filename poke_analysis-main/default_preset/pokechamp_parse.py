import re
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from .common import STAT_KEYS

BASE_URL = "https://pokechamdb.com"
PERCENT_RE = re.compile(r"^(?P<name>.+?)(?P<percent>\d+(?:\.\d+)?)%$")
NUMBER_RE = re.compile(r"^\d+(?:\.\d+)?$")


def parse_index_page(html: str, source_url: str) -> dict:
    soup = BeautifulSoup(html, "html.parser")
    lines = _page_lines(soup)
    return {
        "sourceUrl": source_url,
        "lastUpdated": _line_value(lines, "Last updated:"),
        "seasonLabel": _season_label(lines),
        "rankings": _rankings_from_links(soup),
    }


def parse_pokemon_page(html: str, ranking: dict) -> dict:
    soup = BeautifulSoup(html, "html.parser")
    lines = _page_lines(soup)
    species = _species_name(lines) or ranking["name"]
    return {
        "rank": ranking["rank"],
        "name": species,
        "slug": ranking["slug"],
        "url": ranking["url"],
        "nationalDex": _national_dex(lines),
        "updated": _detail_updated(lines),
        "moves": _percent_section(lines, "MOVES Moves", "ITEMS Items"),
        "items": _percent_section(lines, "ITEMS Items", "ABILITY Abilities"),
        "abilities": _percent_section(lines, "ABILITY Abilities", "NATURE Natures"),
        "natures": _percent_section(lines, "NATURE Natures", "PARTNER Partners"),
        "partners": _partner_section(lines),
        "spreads": _spread_section(lines),
    }


def _page_lines(soup):
    return [line.strip() for line in soup.get_text("\n").splitlines() if line.strip()]


def _line_value(lines, prefix):
    for index, line in enumerate(lines):
        if line == prefix:
            return lines[index + 1] if index + 1 < len(lines) else ""
        if line.startswith(prefix):
            return line.replace(prefix, "", 1).strip()
    return ""


def _season_label(lines):
    for index, line in enumerate(lines):
        if re.match(r"^[A-Z]-\d+$", line) and index + 3 < len(lines):
            return f"{line} {lines[index + 1]}{lines[index + 2]}{lines[index + 3]}"
    return next((line for line in lines if re.match(r"^[A-Z]-\d+\s+\(", line)), "")


def _rankings_from_links(soup):
    rankings = []
    seen_ranks = set()
    for link in soup.find_all("a", href=True):
        record = _ranking_from_link(link)
        if not record or record["rank"] in seen_ranks:
            continue
        seen_ranks.add(record["rank"])
        rankings.append(record)
    return sorted(rankings, key=lambda item: item["rank"])


def _ranking_from_link(link):
    href = link["href"]
    if "/pokemon/" not in href:
        return None
    match = re.match(r"^(?P<rank>\d+)\s+(?P<name>.+)$", link.get_text(" ", strip=True))
    if not match:
        return None
    slug = href.split("/pokemon/", 1)[1].split("?", 1)[0].strip("/")
    return {"rank": int(match["rank"]), "name": match["name"].strip(), "slug": slug, "url": urljoin(BASE_URL, href)}


def _species_name(lines):
    line = next((item for item in lines if item.startswith("# ")), "")
    if line:
        return line[2:].strip()
    if "No." not in lines:
        return ""
    index = lines.index("No.")
    return lines[index + 2] if index + 2 < len(lines) else ""


def _national_dex(lines):
    line = next((item for item in lines if item.startswith("No.")), "")
    if line == "No.":
        index = lines.index(line)
        return int(lines[index + 1]) if index + 1 < len(lines) and lines[index + 1].isdigit() else 0
    return int(re.sub(r"\D", "", line) or 0)


def _detail_updated(lines):
    line = next((item for item in lines if "· Updated " in item), "")
    if line:
        return line.rsplit("Updated ", 1)[-1]
    for index, value in enumerate(lines):
        if value == "Updated" and index + 1 < len(lines):
            return lines[index + 1]
    return ""


def _section_lines(lines, start_label, end_label):
    start_index, start_size = _label_span(lines, start_label)
    if start_index < 0:
        return []
    start = start_index + start_size
    end_index, _ = _label_span(lines[start:], end_label)
    end = start + end_index if end_index >= 0 else len(lines)
    return lines[start:end]


def _percent_section(lines, start_label, end_label):
    entries = []
    pending_name = ""
    for line in _section_lines(lines, start_label, end_label):
        parsed = _parse_percent_line(line, pending_name)
        if parsed:
            entries.append(parsed)
            pending_name = ""
            continue
        pending_name = line
    return entries


def _parse_percent_line(line, pending_name):
    if line.endswith("%") and NUMBER_RE.match(line.rstrip("%")) and pending_name:
        return {"name": pending_name, "percent": float(line.rstrip("%"))}
    match = PERCENT_RE.match(line)
    if not match:
        return None
    return {"name": match["name"].strip(), "percent": float(match["percent"])}


def _partner_section(lines):
    partners = []
    pending_name = ""
    for line in _section_lines(lines, "PARTNER Partners", "EVs Distribution Ranking"):
        parsed = _parse_partner_line(line, pending_name)
        if parsed:
            partners.append(parsed)
            pending_name = ""
            continue
        pending_name = line
    return partners


def _parse_partner_line(line, pending_name):
    match = re.match(r"^(?P<name>.+)#(?P<rank>\d+)$", line)
    if match:
        return {"name": match["name"].strip(), "rank": int(match["rank"])}
    if line.startswith("#") and pending_name:
        return {"name": pending_name, "rank": int(line[1:])}
    return None


def _spread_section(lines):
    spreads = []
    tokens = _section_lines(lines, "EVs Distribution Ranking", "SUPPORT")
    index = 0
    while index + 7 < len(tokens):
        next_spread = _spread_at(tokens, index)
        if next_spread:
            spreads.append(next_spread)
            index += 9 if index + 8 < len(tokens) and tokens[index + 8] == "%" else 8
            continue
        index += 1
    return spreads


def _spread_at(tokens, index):
    if not tokens[index].isdigit():
        return None
    values = tokens[index + 1:index + 7]
    percent = tokens[index + 7]
    if not _valid_spread_tokens(values, percent):
        return None
    points = {key: int(value) for key, value in zip(STAT_KEYS, values)}
    return {"points": points, "percent": float(percent)}


def _label_span(lines, label):
    target = _compact_label(label)
    for index in range(len(lines)):
        matched = _match_label_at(lines, target, index)
        if matched:
            return index, matched
    return -1, 0


def _match_label_at(lines, target, index):
    current = ""
    for size in range(1, 5):
        if index + size > len(lines):
            break
        current += _compact_label(lines[index + size - 1])
        if current == target:
            return size
        if not target.startswith(current):
            break
    return 0


def _compact_label(value):
    return re.sub(r"\s+", "", value).lower()


def _valid_spread_tokens(values, percent):
    return len(values) == len(STAT_KEYS) and all(value.isdigit() for value in values) and NUMBER_RE.match(percent)
