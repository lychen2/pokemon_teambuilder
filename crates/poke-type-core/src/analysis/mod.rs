use serde::Serialize;

use crate::{
    battle::{SpeedTier, TYPE_ORDER, best_move_effectiveness, resistance_to_type, speed_tiers},
    dex::Dataset,
    roles::{RoleSummary, analyze_roles},
    schema::{ChampionPoints, Config, Stats},
};

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TeamAnalysis {
    pub field_state: FieldStateSummary,
    pub defensive: Vec<TypeMatchupEntry>,
    pub offensive: Vec<TypeMatchupEntry>,
    pub coverage: Vec<CoverageEntry>,
    pub roles: Vec<PokemonRoleEntry>,
    pub speed: Vec<SpeedTier>,
    pub identity: TeamIdentity,
    pub weaknesses: Vec<TypeMatchupEntry>,
    pub blind_spots: Vec<TypeMatchupEntry>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FieldStateSummary {
    pub format: String,
    pub tera_enabled: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TypeMatchupEntry {
    pub type_name: String,
    pub score: f64,
    pub count: usize,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CoverageEntry {
    pub type_name: String,
    pub best_multiplier: f64,
    pub attackers: Vec<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PokemonRoleEntry {
    pub species_id: String,
    pub display_name: String,
    pub roles: RoleSummary,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TeamIdentity {
    pub size: usize,
    pub points_total: u16,
    pub mega_count: usize,
    pub restricted_count: usize,
}

pub fn analyze_team(configs: &[Config], dataset: &Dataset) -> TeamAnalysis {
    let defensive = defensive_profile(configs);
    let offensive = offensive_profile(configs, dataset);
    let coverage = coverage_profile(configs, dataset);
    let weaknesses = defensive
        .iter()
        .filter(|entry| entry.score > 1.0)
        .cloned()
        .collect();
    let blind_spots = offensive
        .iter()
        .filter(|entry| entry.score < 2.0)
        .cloned()
        .collect();
    TeamAnalysis {
        field_state: FieldStateSummary {
            format: "champions-vgc".into(),
            tera_enabled: false,
        },
        defensive,
        offensive,
        coverage,
        roles: configs
            .iter()
            .map(|config| PokemonRoleEntry {
                species_id: config.species_id.clone(),
                display_name: config.display_name.clone(),
                roles: analyze_roles(config),
            })
            .collect(),
        speed: speed_tiers(configs),
        identity: team_identity(configs),
        weaknesses,
        blind_spots,
    }
}

fn defensive_profile(configs: &[Config]) -> Vec<TypeMatchupEntry> {
    TYPE_ORDER
        .iter()
        .map(|type_name| {
            let total = configs
                .iter()
                .map(|config| resistance_to_type(config, type_name))
                .sum::<f64>();
            TypeMatchupEntry {
                type_name: (*type_name).into(),
                score: safe_average(total, configs.len()),
                count: configs.len(),
            }
        })
        .collect()
}

fn offensive_profile(configs: &[Config], dataset: &Dataset) -> Vec<TypeMatchupEntry> {
    TYPE_ORDER
        .iter()
        .map(|type_name| {
            let defender = stub_defender(type_name);
            let best = configs
                .iter()
                .map(|config| best_move_effectiveness(config, &defender, dataset))
                .fold(0.0, f64::max);
            TypeMatchupEntry {
                type_name: (*type_name).into(),
                score: best,
                count: configs.len(),
            }
        })
        .collect()
}

fn coverage_profile(configs: &[Config], dataset: &Dataset) -> Vec<CoverageEntry> {
    TYPE_ORDER
        .iter()
        .map(|type_name| {
            let defender = stub_defender(type_name);
            let mut best_multiplier = 0.0;
            let mut attackers = Vec::new();
            for config in configs {
                let multiplier = best_move_effectiveness(config, &defender, dataset);
                if multiplier > best_multiplier {
                    best_multiplier = multiplier;
                    attackers.clear();
                    attackers.push(config.species_id.clone());
                } else if multiplier == best_multiplier && multiplier > 0.0 {
                    attackers.push(config.species_id.clone());
                }
            }
            CoverageEntry {
                type_name: (*type_name).into(),
                best_multiplier,
                attackers,
            }
        })
        .collect()
}

fn team_identity(configs: &[Config]) -> TeamIdentity {
    TeamIdentity {
        size: configs.len(),
        points_total: configs
            .iter()
            .map(|config| champion_points_total(&config.champion_points))
            .sum(),
        mega_count: configs
            .iter()
            .filter(|config| config.species_id.ends_with("mega"))
            .count(),
        restricted_count: configs
            .iter()
            .filter(|config| champion_points_total(&config.champion_points) >= 20)
            .count(),
    }
}

fn stub_defender(type_name: &str) -> Config {
    Config {
        id: String::new(),
        species_id: String::new(),
        species_name: String::new(),
        display_name: String::new(),
        note: String::new(),
        types: vec![type_name.into()],
        ability: String::new(),
        item: String::new(),
        tera_type: String::new(),
        nature: String::new(),
        level: 50,
        champion_points: ChampionPoints::default(),
        move_names: Vec::new(),
        stats: Stats::default(),
    }
}

fn champion_points_total(points: &ChampionPoints) -> u16 {
    points.hp + points.atk + points.def + points.spa + points.spd + points.spe
}

fn safe_average(total: f64, count: usize) -> f64 {
    if count == 0 {
        0.0
    } else {
        total / count as f64
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{dex::Dataset, showdown::parse_showdown_text};
    use std::path::Path;

    #[test]
    fn analyzes_single_config_team_profiles() {
        let dataset = Dataset::load_from_repo(Path::new("../..")).unwrap();
        let text = include_str!("../../../../tests/fixtures/basic-team.txt");
        let parsed = parse_showdown_text(text, &dataset).unwrap();
        let analysis = analyze_team(&parsed.configs, &dataset);
        assert_eq!(analysis.field_state.format, "champions-vgc");
        assert_eq!(analysis.speed.len(), 1);
        assert_eq!(analysis.roles.len(), 1);
        assert!(
            analysis
                .coverage
                .iter()
                .any(|entry| entry.best_multiplier >= 2.0)
        );
        assert!(analysis.identity.points_total > 0);
    }
}
