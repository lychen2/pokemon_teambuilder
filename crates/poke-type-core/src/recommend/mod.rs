use std::collections::HashSet;

use serde::Serialize;
use serde_json::Value;

use crate::{
    battle::{TYPE_ORDER, resistance_to_type, type_multiplier},
    dex::Dataset,
    schema::Config,
    usage::usage_rows,
};

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RecommendationEntry {
    pub species_id: String,
    pub species_name: String,
    pub score: f64,
    pub usage: f64,
    pub reasons: Vec<String>,
}

pub fn recommend_team_members(
    team: &[Config],
    dataset: &Dataset,
    limit: usize,
) -> Vec<RecommendationEntry> {
    if team.len() >= 6 || limit == 0 {
        return Vec::new();
    }
    let existing = team
        .iter()
        .map(|config| config.species_id.as_str())
        .collect::<HashSet<_>>();
    let missing_defense = weakest_defensive_types(team);
    let missing_offense = weakest_offensive_types(team);
    let usage = usage_rows(dataset, None);
    let mut entries = usage
        .into_iter()
        .filter(|row| !existing.contains(row.species_id.as_str()))
        .filter(|row| dataset.champions_usable_species.contains(&row.species_id))
        .map(|row| {
            let types = species_types(dataset, &row.species_id);
            let mut score = row.usage;
            let mut reasons = Vec::new();
            for attack_type in &missing_defense {
                if types
                    .iter()
                    .map(|defense| type_multiplier(attack_type, defense))
                    .product::<f64>()
                    < 1.0
                {
                    score += 8.0;
                    reasons.push(format!("resists-{attack_type}"));
                }
            }
            for defense_type in &missing_offense {
                if types
                    .iter()
                    .any(|attack_type| type_multiplier(attack_type, defense_type) > 1.0)
                {
                    score += 6.0;
                    reasons.push(format!("covers-{defense_type}"));
                }
            }
            RecommendationEntry {
                species_id: row.species_id,
                species_name: row.species_name,
                score,
                usage: row.usage,
                reasons,
            }
        })
        .collect::<Vec<_>>();
    if entries.is_empty() {
        entries = fallback_species(dataset, &existing, &missing_defense, &missing_offense);
    }
    entries.sort_by(|left, right| {
        right
            .score
            .total_cmp(&left.score)
            .then_with(|| left.species_id.cmp(&right.species_id))
    });
    entries.truncate(limit);
    entries
}

fn weakest_defensive_types(team: &[Config]) -> Vec<&'static str> {
    let mut entries = TYPE_ORDER
        .iter()
        .map(|type_name| {
            let average = if team.is_empty() {
                1.0
            } else {
                team.iter()
                    .map(|config| resistance_to_type(config, type_name))
                    .sum::<f64>()
                    / team.len() as f64
            };
            (*type_name, average)
        })
        .collect::<Vec<_>>();
    entries.sort_by(|left, right| right.1.total_cmp(&left.1));
    entries
        .into_iter()
        .filter(|entry| entry.1 >= 1.0)
        .take(3)
        .map(|entry| entry.0)
        .collect()
}

fn weakest_offensive_types(team: &[Config]) -> Vec<&'static str> {
    let team_types = team
        .iter()
        .flat_map(|config| config.types.iter().map(String::as_str))
        .collect::<Vec<_>>();
    let mut entries = TYPE_ORDER
        .iter()
        .map(|defense_type| {
            let best = team_types
                .iter()
                .map(|attack_type| type_multiplier(attack_type, defense_type))
                .fold(0.0, f64::max);
            (*defense_type, best)
        })
        .collect::<Vec<_>>();
    entries.sort_by(|left, right| left.1.total_cmp(&right.1));
    entries.into_iter().take(3).map(|entry| entry.0).collect()
}

fn fallback_species(
    dataset: &Dataset,
    existing: &HashSet<&str>,
    missing_defense: &[&str],
    missing_offense: &[&str],
) -> Vec<RecommendationEntry> {
    dataset
        .champions_usable_species
        .iter()
        .filter(|species_id| !existing.contains(species_id.as_str()))
        .map(|species_id| {
            let types = species_types(dataset, species_id);
            let mut score = 1.0;
            let mut reasons = Vec::new();
            for attack_type in missing_defense {
                if types
                    .iter()
                    .map(|defense| type_multiplier(attack_type, defense))
                    .product::<f64>()
                    < 1.0
                {
                    score += 8.0;
                    reasons.push(format!("resists-{attack_type}"));
                }
            }
            for defense_type in missing_offense {
                if types
                    .iter()
                    .any(|attack_type| type_multiplier(attack_type, defense_type) > 1.0)
                {
                    score += 6.0;
                    reasons.push(format!("covers-{defense_type}"));
                }
            }
            RecommendationEntry {
                species_id: species_id.clone(),
                species_name: species_name(dataset, species_id),
                score,
                usage: 0.0,
                reasons,
            }
        })
        .collect()
}

fn species_types(dataset: &Dataset, species_id: &str) -> Vec<String> {
    dataset
        .pokedex
        .get(species_id)
        .and_then(|entry| entry.get("types"))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(str::to_owned)
        .collect()
}

fn species_name(dataset: &Dataset, species_id: &str) -> String {
    dataset
        .pokedex
        .get(species_id)
        .and_then(|entry| entry.get("name"))
        .and_then(Value::as_str)
        .unwrap_or(species_id)
        .to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{dex::Dataset, showdown::parse_showdown_text};
    use std::path::Path;

    #[test]
    fn recommends_available_species_not_on_team() {
        let dataset = Dataset::load_from_repo(Path::new("../..")).unwrap();
        let text = include_str!("../../../../tests/fixtures/basic-team.txt");
        let parsed = parse_showdown_text(text, &dataset).unwrap();
        let recommendations = recommend_team_members(&parsed.configs, &dataset, 5);
        assert!(!recommendations.is_empty());
        assert!(
            recommendations
                .iter()
                .all(|entry| entry.species_id != "garchomp")
        );
        assert!(
            recommendations
                .windows(2)
                .all(|pair| pair[0].score >= pair[1].score)
        );
    }
}
