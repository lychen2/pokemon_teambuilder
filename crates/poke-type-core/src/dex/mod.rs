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
        let champions_usable_species = champions_vgc
            .get("usableSpeciesIds")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .map(str::to_owned)
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
