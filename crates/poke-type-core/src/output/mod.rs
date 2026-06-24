use serde::Serialize;
use serde_json::Value;

use crate::{dex::Dataset, schema::Config, showdown::normalize_name};

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OutputTier {
    pub score: i64,
    pub total_count: usize,
    pub entries: Vec<OutputEntry>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OutputEntry {
    pub species_id: String,
    pub species_name: String,
    pub display_name: String,
    pub peak_move_name: String,
    pub peak_score: f64,
    pub stable_move_name: String,
    pub stable_score: f64,
}

#[derive(Debug, Clone, PartialEq)]
struct ScoredMove {
    name: String,
    score: f64,
}

pub fn calculate_output_tiers(configs: &[Config], dataset: &Dataset) -> Vec<OutputTier> {
    let mut entries = configs
        .iter()
        .filter_map(|config| build_output_entry(config, dataset))
        .collect::<Vec<_>>();
    entries.sort_by(|left, right| right.peak_score.total_cmp(&left.peak_score));
    let mut tiers: Vec<OutputTier> = Vec::new();
    for entry in entries {
        let score = entry.peak_score.round() as i64;
        if let Some(tier) = tiers.iter_mut().find(|tier| tier.score == score) {
            tier.entries.push(entry);
            tier.total_count = tier.entries.len();
        } else {
            tiers.push(OutputTier {
                score,
                total_count: 1,
                entries: vec![entry],
            });
        }
    }
    tiers.sort_by(|left, right| right.score.cmp(&left.score));
    tiers
}

fn build_output_entry(config: &Config, dataset: &Dataset) -> Option<OutputEntry> {
    let mut moves = config
        .move_names
        .iter()
        .filter_map(|name| score_move(config, name, dataset))
        .collect::<Vec<_>>();
    moves.sort_by(|left, right| {
        right
            .score
            .total_cmp(&left.score)
            .then_with(|| left.name.cmp(&right.name))
    });
    let peak = moves.first()?;
    Some(OutputEntry {
        species_id: config.species_id.clone(),
        species_name: config.species_name.clone(),
        display_name: config.display_name.clone(),
        peak_move_name: peak.name.clone(),
        peak_score: peak.score,
        stable_move_name: peak.name.clone(),
        stable_score: peak.score,
    })
}

fn score_move(config: &Config, move_name: &str, dataset: &Dataset) -> Option<ScoredMove> {
    let entry = dataset.moves.get(&normalize_name(move_name))?;
    let category = entry
        .get("category")
        .and_then(Value::as_str)
        .unwrap_or("Status");
    if category == "Status" {
        return None;
    }
    let base_power = entry
        .get("basePower")
        .and_then(Value::as_f64)
        .unwrap_or(0.0);
    if base_power <= 0.0 {
        return None;
    }
    let move_type = entry.get("type").and_then(Value::as_str).unwrap_or("");
    let offense = (if category == "Physical" {
        config.stats.atk
    } else {
        config.stats.spa
    }) as f64;
    let stab = if config.types.iter().any(|kind| kind == move_type) {
        1.5
    } else {
        1.0
    };
    let accuracy = match entry.get("accuracy") {
        Some(Value::Bool(true)) => 100.0,
        Some(value) => value.as_f64().unwrap_or(100.0),
        None => 100.0,
    };
    let accuracy_factor = if accuracy > 0.0 {
        accuracy / 100.0
    } else {
        1.0
    };
    Some(ScoredMove {
        name: entry
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or(move_name)
            .to_owned(),
        score: offense * base_power * stab * accuracy_factor,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{dex::Dataset, showdown::parse_showdown_text};
    use std::path::Path;

    #[test]
    fn scores_garchomp_output_from_real_moves() {
        let dataset = Dataset::load_from_repo(Path::new("../..")).unwrap();
        let text = include_str!("../../../../tests/fixtures/basic-team.txt");
        let parsed = parse_showdown_text(&text, &dataset).unwrap();
        let tiers = calculate_output_tiers(&parsed.configs, &dataset);
        assert!(!tiers.is_empty());
        assert!(tiers.iter().any(|tier| {
            tier.entries
                .iter()
                .any(|entry| entry.species_id == "garchomp" && entry.peak_score > 0.0)
        }));
    }
}
