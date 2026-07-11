use anyhow::{Context, Result};
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
};

#[derive(Debug, Clone)]
pub struct Dataset {
    pub pokedex: HashMap<String, Value>,
    pub moves: HashMap<String, Value>,
    pub abilities: HashMap<String, Value>,
    pub items: HashMap<String, Value>,
    pub forms_index: HashMap<String, Value>,
    pub usage: Value,
    pub champions_vgc: Value,
    pub paste_teams: Value,
    pub champions_usable_species: HashSet<String>,
}

impl Dataset {
    pub fn load_from_repo(root: &Path) -> Result<Self> {
        let root = normalize_root(root);
        let pokedex = load_map(root.join("poke_analysis-main/stats/pokedex.json"))?;
        let moves = load_map(root.join("poke_analysis-main/stats/moves.json"))?;
        let abilities = load_map(root.join("poke_analysis-main/stats/abilities.json"))?;
        let items = load_map(root.join("poke_analysis-main/stats/items.json"))?;
        let forms_index = load_map(root.join("poke_analysis-main/stats/forms_index.json"))?;
        let usage = load_value(root.join("static/usage.json"))?;
        let paste_teams = load_value(root.join("static/paste_teams_champions_mb.json"))?;
        let champions_vgc = load_value(root.join("poke_analysis-main/stats/champions_vgc.json"))?;
        let champions_usable_species: HashSet<String> = champions_vgc
            .get("usableSpeciesIds")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .map(str::to_owned)
            .filter(|species_id| is_selectable_battle_species(&pokedex, species_id))
            .collect();
        Ok(Self {
            pokedex,
            moves,
            abilities,
            items,
            forms_index,
            usage,
            champions_vgc,
            paste_teams,
            champions_usable_species,
        })
    }
}

fn normalize_identifier(value: &str) -> String {
    value
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

fn is_mega_entry(entry: &Value) -> bool {
    let forme = entry
        .get("forme")
        .and_then(Value::as_str)
        .unwrap_or("");
    let name = entry
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or("");
    forme.starts_with("Mega") || name.contains("-Mega")
}

fn json_str<'a>(entry: &'a Value, key: &str) -> Option<&'a str> {
    entry.get(key).and_then(Value::as_str)
}

fn is_battle_equivalent_form(entry: &Value, base_entry: &Value) -> bool {
    let Some(base_species) = json_str(entry, "baseSpecies") else {
        return false;
    };
    if base_species.is_empty() {
        return false;
    }
    if is_mega_entry(entry) {
        return false;
    }
    if json_str(entry, "requiredItem").map_or(false, |v| !v.is_empty())
        || json_str(entry, "requiredMove").map_or(false, |v| !v.is_empty())
        || json_str(entry, "battleOnly").map_or(false, |v| !v.is_empty())
        || json_str(entry, "changesFrom").map_or(false, |v| !v.is_empty())
    {
        return false;
    }
    let types_eq = entry.get("types") == base_entry.get("types");
    let stats_eq = ["hp", "atk", "def", "spa", "spd", "spe"].iter().all(|stat| {
        entry.get("baseStats").and_then(|s| s.get(stat))
            == base_entry.get("baseStats").and_then(|s| s.get(stat))
    });
    let abilities_eq = entry.get("abilities") == base_entry.get("abilities");
    types_eq && stats_eq && abilities_eq
}

fn is_selectable_battle_species(pokedex: &HashMap<String, Value>, species_id: &str) -> bool {
    let Some(entry) = pokedex.get(species_id) else {
        return false;
    };
    if json_str(entry, "name").map_or(true, str::is_empty) {
        return false;
    }
    if !entry.get("baseStats").map_or(false, |v| v.is_object()) {
        return false;
    }
    if json_str(entry, "battleOnly").map_or(false, |v| !v.is_empty()) && !is_mega_entry(entry) {
        return false;
    }
    let base_species_id = normalize_identifier(json_str(entry, "baseSpecies").unwrap_or(""));
    if base_species_id.is_empty() {
        return true;
    }
    let Some(base_entry) = pokedex.get(&base_species_id) else {
        return true;
    };
    !is_battle_equivalent_form(entry, base_entry)
}


fn normalize_root(root: &Path) -> PathBuf {
    if root.join("poke_analysis-main/stats/pokedex.json").exists() {
        return root.to_path_buf();
    }
    if let Ok(current) = std::env::current_dir() {
        for ancestor in current.ancestors() {
            if ancestor
                .join("poke_analysis-main/stats/pokedex.json")
                .exists()
            {
                return ancestor.to_path_buf();
            }
        }
    }
    root.to_path_buf()
}

fn load_map(path: PathBuf) -> Result<HashMap<String, Value>> {
    let value = load_value(path)?;
    value
        .as_object()
        .map(|object| {
            object
                .iter()
                .map(|(key, value)| (key.clone(), value.clone()))
                .collect()
        })
        .context("expected JSON object")
}

fn load_value(path: PathBuf) -> Result<Value> {
    let text =
        fs::read_to_string(&path).with_context(|| format!("failed to read {}", path.display()))?;
    serde_json::from_str(&text)
        .or_else(|_| json5::from_str(&text))
        .with_context(|| format!("failed to parse {}", path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn loads_core_dataset_files() {
        let dataset = Dataset::load_from_repo(Path::new("../..")).unwrap();
        assert!(dataset.pokedex.contains_key("garchomp"));
        assert!(dataset.moves.contains_key("earthquake"));
        assert!(dataset.abilities.contains_key("roughskin"));
        assert!(dataset.items.contains_key("lifeorb"));
        assert!(dataset.champions_usable_species.contains("garchomp"));
        assert!(dataset.usage.get("data").is_some());
        assert!(dataset.paste_teams.get("teams").is_some());
        assert!(dataset.forms_index.contains_key("garchompmega"));
    }
}
