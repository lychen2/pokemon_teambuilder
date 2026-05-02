import json
import re

import requests


def json_dumps(payload):
    return json.dumps(payload, ensure_ascii=False, indent=2) + "\n"


def json5_to_json(text):
    return re.sub(r'([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)(\s*:)', r'\1"\2"\3', text)


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def load_json5_object(path):
    return json.loads(json5_to_json(path.read_text(encoding="utf-8")))


def write_json(path, payload):
    path.write_text(json_dumps(payload), encoding="utf-8")


def fetch_text(url):
    response = requests.get(url, timeout=60)
    response.raise_for_status()
    return response.text


def fetch_binary_to_file(url, destination, label):
    print(f"Updating {label}.")
    response = requests.get(url, stream=True, timeout=60)
    response.raise_for_status()
    with destination.open("wb") as file_obj:
        for chunk in response.iter_content(chunk_size=8192):
            file_obj.write(chunk)


def parse_exported_array(source, export_name):
    match = re.search(rf"exports\.{export_name}\s*=\s*(\[[\s\S]*\]);\s*$", source)
    if not match:
        raise ValueError(f"{export_name} not found")
    return json.loads(json5_to_json(match.group(1)))


def parse_exported_object(source, export_name):
    match = re.search(rf"exports\.{export_name}\s*=\s*(\{{[\s\S]*\}});?\s*$", source)
    if not match:
        raise ValueError(f"{export_name} not found")
    return json.loads(json5_to_json(match.group(1)))
