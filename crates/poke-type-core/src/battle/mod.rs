use serde::Serialize;
use serde_json::Value;

use crate::{dex::Dataset, schema::Config, showdown::normalize_name};

pub const TYPE_ORDER: [&str; 18] = [
    "Normal", "Fighting", "Flying", "Poison", "Ground", "Rock", "Bug", "Ghost", "Steel", "Fire",
    "Water", "Grass", "Electric", "Psychic", "Ice", "Dragon", "Dark", "Fairy",
];

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SpeedVariant {
    pub mode: String,
    pub speed: u16,
    pub sources: Vec<String>,
    pub is_boosted: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SpeedTier {
    pub speed: u16,
    pub total_count: usize,
    pub entries: Vec<SpeedTierEntry>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SpeedTierEntry {
    pub species_id: String,
    pub display_name: String,
    pub speed: u16,
}

pub fn get_effective_speed(config: &Config) -> u16 {
    speed_variants(config)
        .into_iter()
        .map(|variant| variant.speed)
        .max()
        .unwrap_or(0)
}

pub fn speed_variants(config: &Config) -> Vec<SpeedVariant> {
    let mut out = vec![SpeedVariant {
        mode: "base".into(),
        speed: config.stats.spe,
        sources: vec![],
        is_boosted: false,
    }];
    let item_id = normalize_name(&config.item);
    if item_id == "choicescarf" {
        out.push(SpeedVariant {
            mode: "scarf".into(),
            speed: ((config.stats.spe as f64) * 1.5).floor() as u16,
            sources: vec!["Choice Scarf".into()],
            is_boosted: true,
        });
    }
    if item_id == "ironball" {
        out.push(SpeedVariant {
            mode: "ironball".into(),
            speed: ((config.stats.spe as f64) * 0.5).floor() as u16,
            sources: vec!["Iron Ball".into()],
            is_boosted: true,
        });
    }
    let ability = normalize_name(&config.ability);
    if [
        "swiftswim",
        "chlorophyll",
        "sandrush",
        "slushrush",
        "surgesurfer",
        "unburden",
    ]
    .contains(&ability.as_str())
    {
        out.push(SpeedVariant {
            mode: "double".into(),
            speed: config.stats.spe.saturating_mul(2),
            sources: vec![config.ability.clone()],
            is_boosted: true,
        });
    }
    if ["quickfeet", "speedboost"].contains(&ability.as_str()) {
        out.push(SpeedVariant {
            mode: "plus1".into(),
            speed: ((config.stats.spe as f64) * 1.5).floor() as u16,
            sources: vec![config.ability.clone()],
            is_boosted: true,
        });
    }
    dedupe_speed_variants(out)
}

pub fn speed_tiers(configs: &[Config]) -> Vec<SpeedTier> {
    let mut entries = configs
        .iter()
        .map(|config| SpeedTierEntry {
            species_id: config.species_id.clone(),
            display_name: config.display_name.clone(),
            speed: get_effective_speed(config),
        })
        .collect::<Vec<_>>();
    entries.sort_by(|left, right| {
        right
            .speed
            .cmp(&left.speed)
            .then_with(|| left.display_name.cmp(&right.display_name))
    });
    let mut tiers = Vec::<SpeedTier>::new();
    for entry in entries {
        if let Some(tier) = tiers.iter_mut().find(|tier| tier.speed == entry.speed) {
            tier.entries.push(entry);
            tier.total_count = tier.entries.len();
        } else {
            tiers.push(SpeedTier {
                speed: entry.speed,
                total_count: 1,
                entries: vec![entry],
            });
        }
    }
    tiers
}

pub fn move_effectiveness(
    move_name: &str,
    attacker: &Config,
    defender: &Config,
    dataset: &Dataset,
) -> f64 {
    let Some(move_entry) = dataset.moves.get(&normalize_name(move_name)) else {
        return 0.0;
    };
    if move_entry
        .get("category")
        .and_then(Value::as_str)
        .unwrap_or("Status")
        == "Status"
    {
        return 0.0;
    }
    let attack_type = move_entry.get("type").and_then(Value::as_str).unwrap_or("");
    if attack_type.is_empty() {
        return 0.0;
    }
    let mut multiplier = 1.0;
    for defend_type in &defender.types {
        multiplier *= type_multiplier(attack_type, defend_type);
    }
    if multiplier > 0.0 && multiplier < 1.0 && normalize_name(&attacker.ability) == "tintedlens" {
        multiplier *= 2.0;
    }
    multiplier
}

pub fn best_move_effectiveness(attacker: &Config, defender: &Config, dataset: &Dataset) -> f64 {
    attacker
        .move_names
        .iter()
        .map(|name| move_effectiveness(name, attacker, defender, dataset))
        .fold(0.0, f64::max)
}

pub fn coverage_against_type(config: &Config, defend_type: &str, dataset: &Dataset) -> f64 {
    let defender = Config {
        types: vec![defend_type.to_owned()],
        ..config_stub()
    };
    best_move_effectiveness(config, &defender, dataset)
}

pub fn resistance_to_type(config: &Config, attack_type: &str) -> f64 {
    config.types.iter().fold(1.0, |total, defend_type| {
        total * type_multiplier(attack_type, defend_type)
    })
}

pub fn type_multiplier(attack_type: &str, defend_type: &str) -> f64 {
    match (attack_type, defend_type) {
        ("Normal", "Rock") | ("Normal", "Steel") => 0.5,
        ("Normal", "Ghost") => 0.0,
        ("Fighting", "Normal")
        | ("Fighting", "Rock")
        | ("Fighting", "Steel")
        | ("Fighting", "Ice")
        | ("Fighting", "Dark") => 2.0,
        ("Fighting", "Flying")
        | ("Fighting", "Poison")
        | ("Fighting", "Bug")
        | ("Fighting", "Psychic")
        | ("Fighting", "Fairy") => 0.5,
        ("Fighting", "Ghost") => 0.0,
        ("Flying", "Fighting") | ("Flying", "Bug") | ("Flying", "Grass") => 2.0,
        ("Flying", "Rock") | ("Flying", "Steel") | ("Flying", "Electric") => 0.5,
        ("Poison", "Grass") | ("Poison", "Fairy") => 2.0,
        ("Poison", "Poison") | ("Poison", "Ground") | ("Poison", "Rock") | ("Poison", "Ghost") => {
            0.5
        }
        ("Poison", "Steel") => 0.0,
        ("Ground", "Poison")
        | ("Ground", "Rock")
        | ("Ground", "Steel")
        | ("Ground", "Fire")
        | ("Ground", "Electric") => 2.0,
        ("Ground", "Bug") | ("Ground", "Grass") => 0.5,
        ("Ground", "Flying") => 0.0,
        ("Rock", "Flying") | ("Rock", "Bug") | ("Rock", "Fire") | ("Rock", "Ice") => 2.0,
        ("Rock", "Fighting") | ("Rock", "Ground") | ("Rock", "Steel") => 0.5,
        ("Bug", "Grass") | ("Bug", "Psychic") | ("Bug", "Dark") => 2.0,
        ("Bug", "Fighting")
        | ("Bug", "Flying")
        | ("Bug", "Poison")
        | ("Bug", "Ghost")
        | ("Bug", "Steel")
        | ("Bug", "Fire")
        | ("Bug", "Fairy") => 0.5,
        ("Ghost", "Psychic") | ("Ghost", "Ghost") => 2.0,
        ("Ghost", "Dark") => 0.5,
        ("Ghost", "Normal") => 0.0,
        ("Steel", "Rock") | ("Steel", "Ice") | ("Steel", "Fairy") => 2.0,
        ("Steel", "Steel") | ("Steel", "Fire") | ("Steel", "Water") | ("Steel", "Electric") => 0.5,
        ("Fire", "Bug") | ("Fire", "Steel") | ("Fire", "Grass") | ("Fire", "Ice") => 2.0,
        ("Fire", "Rock") | ("Fire", "Fire") | ("Fire", "Water") | ("Fire", "Dragon") => 0.5,
        ("Water", "Ground") | ("Water", "Rock") | ("Water", "Fire") => 2.0,
        ("Water", "Water") | ("Water", "Grass") | ("Water", "Dragon") => 0.5,
        ("Grass", "Ground") | ("Grass", "Rock") | ("Grass", "Water") => 2.0,
        ("Grass", "Flying")
        | ("Grass", "Poison")
        | ("Grass", "Bug")
        | ("Grass", "Steel")
        | ("Grass", "Fire")
        | ("Grass", "Grass")
        | ("Grass", "Dragon") => 0.5,
        ("Electric", "Flying") | ("Electric", "Water") => 2.0,
        ("Electric", "Grass") | ("Electric", "Electric") | ("Electric", "Dragon") => 0.5,
        ("Electric", "Ground") => 0.0,
        ("Psychic", "Fighting") | ("Psychic", "Poison") => 2.0,
        ("Psychic", "Steel") | ("Psychic", "Psychic") => 0.5,
        ("Psychic", "Dark") => 0.0,
        ("Ice", "Flying") | ("Ice", "Ground") | ("Ice", "Grass") | ("Ice", "Dragon") => 2.0,
        ("Ice", "Steel") | ("Ice", "Fire") | ("Ice", "Water") | ("Ice", "Ice") => 0.5,
        ("Dragon", "Dragon") => 2.0,
        ("Dragon", "Steel") => 0.5,
        ("Dragon", "Fairy") => 0.0,
        ("Dark", "Ghost") | ("Dark", "Psychic") => 2.0,
        ("Dark", "Fighting") | ("Dark", "Dark") | ("Dark", "Fairy") => 0.5,
        ("Fairy", "Fighting") | ("Fairy", "Dragon") | ("Fairy", "Dark") => 2.0,
        ("Fairy", "Poison") | ("Fairy", "Steel") | ("Fairy", "Fire") => 0.5,
        _ => 1.0,
    }
}

fn dedupe_speed_variants(variants: Vec<SpeedVariant>) -> Vec<SpeedVariant> {
    let mut out = Vec::new();
    for variant in variants {
        if !out.iter().any(|existing: &SpeedVariant| {
            existing.mode == variant.mode && existing.speed == variant.speed
        }) {
            out.push(variant);
        }
    }
    out
}

fn config_stub() -> Config {
    Config {
        id: String::new(),
        species_id: String::new(),
        species_name: String::new(),
        display_name: String::new(),
        note: String::new(),
        types: Vec::new(),
        ability: String::new(),
        item: String::new(),
        tera_type: String::new(),
        nature: String::new(),
        level: 50,
        champion_points: Default::default(),
        move_names: Vec::new(),
        stats: Default::default(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{dex::Dataset, showdown::parse_showdown_text};
    use std::path::Path;

    #[test]
    fn computes_type_effectiveness_and_speed() {
        let dataset = Dataset::load_from_repo(Path::new("../..")).unwrap();
        let text = include_str!("../../../../tests/fixtures/basic-team.txt");
        let parsed = parse_showdown_text(text, &dataset).unwrap();
        let garchomp = &parsed.configs[0];
        assert!(get_effective_speed(garchomp) > 0);
        assert_eq!(
            type_multiplier("Ice", "Dragon") * type_multiplier("Ice", "Ground"),
            4.0
        );
        assert!(coverage_against_type(garchomp, "Fire", &dataset) >= 1.0);
    }
}
