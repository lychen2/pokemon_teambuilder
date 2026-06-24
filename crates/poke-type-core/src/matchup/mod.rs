use serde::Serialize;
use serde_json::Value;

use crate::{
    battle::{best_move_effectiveness, get_effective_speed},
    champions::{BaseStats, calculate_stats},
    dex::Dataset,
    schema::{ChampionPoints, Config},
};

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OpponentTeamEntry {
    pub team_id: String,
    pub description: String,
    pub owner: String,
    pub member_species_ids: Vec<String>,
    pub member_species_names: Vec<String>,
    pub configs: Vec<Config>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MatchupAnalysis {
    pub overview: MatchupOverview,
    pub board: Vec<MatchupCell>,
    pub speed_lines: Vec<SpeedLineEntry>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MatchupOverview {
    pub ally_count: usize,
    pub opponent_count: usize,
    pub favorable_cells: usize,
    pub danger_cells: usize,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MatchupCell {
    pub ally_species_id: String,
    pub opponent_species_id: String,
    pub best_multiplier: f64,
    pub incoming_multiplier: f64,
    pub initiative: i16,
    pub rating: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SpeedLineEntry {
    pub side: String,
    pub species_id: String,
    pub speed: u16,
}

pub fn build_opponent_library(dataset: &Dataset, limit: usize) -> Vec<OpponentTeamEntry> {
    let Some(teams) = dataset.paste_teams.get("teams").and_then(Value::as_array) else {
        return Vec::new();
    };
    teams
        .iter()
        .take(limit)
        .filter_map(parse_opponent_team)
        .collect()
}

pub fn analyze_matchup(
    team: &[Config],
    opponent: &[Config],
    dataset: &Dataset,
) -> Option<MatchupAnalysis> {
    if team.is_empty() || opponent.is_empty() {
        return None;
    }
    let mut favorable_cells = 0;
    let mut danger_cells = 0;
    let mut board = Vec::new();
    for ally in team {
        for foe in opponent {
            let best_multiplier = best_move_effectiveness(ally, foe, dataset);
            let incoming_multiplier = best_move_effectiveness(foe, ally, dataset);
            let initiative = get_effective_speed(ally) as i16 - get_effective_speed(foe) as i16;
            let rating = matchup_rating(best_multiplier, incoming_multiplier, initiative);
            if rating == "favorable" {
                favorable_cells += 1;
            }
            if rating == "danger" {
                danger_cells += 1;
            }
            board.push(MatchupCell {
                ally_species_id: ally.species_id.clone(),
                opponent_species_id: foe.species_id.clone(),
                best_multiplier,
                incoming_multiplier,
                initiative,
                rating,
            });
        }
    }
    Some(MatchupAnalysis {
        overview: MatchupOverview {
            ally_count: team.len(),
            opponent_count: opponent.len(),
            favorable_cells,
            danger_cells,
        },
        board,
        speed_lines: speed_lines(team, opponent),
    })
}

fn parse_opponent_team(value: &Value) -> Option<OpponentTeamEntry> {
    Some(OpponentTeamEntry {
        team_id: value.get("teamId")?.as_str()?.to_owned(),
        description: value
            .get("description")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_owned(),
        owner: value
            .get("owner")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_owned(),
        member_species_ids: value
            .get("memberSpeciesIds")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .map(str::to_owned)
            .collect(),
        member_species_names: value
            .get("memberSpeciesNames")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .map(str::to_owned)
            .collect(),
        configs: value
            .get("configs")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .enumerate()
            .filter_map(|(index, config)| parse_opponent_config(config, index + 1))
            .collect(),
    })
}

fn parse_opponent_config(value: &Value, slot: usize) -> Option<Config> {
    let species_id = value.get("speciesId")?.as_str()?.to_owned();
    let species_name = value
        .get("species")
        .and_then(Value::as_str)
        .unwrap_or(&species_id)
        .to_owned();
    let types = value
        .get("types")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(str::to_owned)
        .collect::<Vec<_>>();
    let points = parse_points(value.get("points"));
    let stats = value
        .get("baseStats")
        .and_then(parse_base_stats)
        .map(|base| calculate_stats(&base, &points, string_value(value, "nature")))
        .unwrap_or_default();
    Some(Config {
        id: format!("{species_id}-opponent-{slot}"),
        species_id,
        species_name: species_name.clone(),
        display_name: species_name,
        note: string_value(value, "note").to_owned(),
        types,
        ability: string_value(value, "ability").to_owned(),
        item: string_value(value, "item").to_owned(),
        tera_type: String::new(),
        nature: string_value(value, "nature").to_owned(),
        level: 50,
        champion_points: points,
        move_names: value
            .get("moves")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .map(str::to_owned)
            .collect(),
        stats,
    })
}

fn parse_points(value: Option<&Value>) -> ChampionPoints {
    let Some(value) = value else {
        return ChampionPoints::default();
    };
    ChampionPoints {
        hp: u16_field(value, "hp"),
        atk: u16_field(value, "atk"),
        def: u16_field(value, "def"),
        spa: u16_field(value, "spa"),
        spd: u16_field(value, "spd"),
        spe: u16_field(value, "spe"),
    }
}

fn parse_base_stats(value: &Value) -> Option<BaseStats> {
    Some(BaseStats {
        hp: u16_field(value, "hp"),
        atk: u16_field(value, "atk"),
        def: u16_field(value, "def"),
        spa: u16_field(value, "spa"),
        spd: u16_field(value, "spd"),
        spe: u16_field(value, "spe"),
    })
}

fn string_value<'a>(value: &'a Value, key: &str) -> &'a str {
    value.get(key).and_then(Value::as_str).unwrap_or("")
}

fn u16_field(value: &Value, key: &str) -> u16 {
    value.get(key).and_then(Value::as_u64).unwrap_or(0) as u16
}

fn speed_lines(team: &[Config], opponent: &[Config]) -> Vec<SpeedLineEntry> {
    let mut entries = team
        .iter()
        .map(|config| SpeedLineEntry {
            side: "ally".into(),
            species_id: config.species_id.clone(),
            speed: get_effective_speed(config),
        })
        .chain(opponent.iter().map(|config| SpeedLineEntry {
            side: "opponent".into(),
            species_id: config.species_id.clone(),
            speed: get_effective_speed(config),
        }))
        .collect::<Vec<_>>();
    entries.sort_by(|left, right| right.speed.cmp(&left.speed));
    entries
}

fn matchup_rating(best_multiplier: f64, incoming_multiplier: f64, initiative: i16) -> String {
    if best_multiplier >= 2.0 && (incoming_multiplier <= 1.0 || initiative >= 0) {
        "favorable".into()
    } else if incoming_multiplier >= 2.0 && best_multiplier < 2.0 {
        "danger".into()
    } else {
        "neutral".into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{dex::Dataset, showdown::parse_showdown_text};
    use std::path::Path;

    #[test]
    fn builds_opponent_library_from_paste_teams() {
        let dataset = Dataset::load_from_repo(Path::new("../..")).unwrap();
        let library = build_opponent_library(&dataset, 10);
        assert!(!library.is_empty());
        assert!(library.iter().all(|entry| !entry.team_id.is_empty()));
        assert!(
            library
                .iter()
                .all(|entry| !entry.member_species_ids.is_empty())
        );
    }

    #[test]
    fn analyzes_matchup_board() {
        let dataset = Dataset::load_from_repo(Path::new("../..")).unwrap();
        let text = include_str!("../../../../tests/fixtures/basic-team.txt");
        let parsed = parse_showdown_text(text, &dataset).unwrap();
        let analysis = analyze_matchup(&parsed.configs, &parsed.configs, &dataset).unwrap();
        assert_eq!(analysis.overview.ally_count, 1);
        assert_eq!(analysis.overview.opponent_count, 1);
        assert_eq!(analysis.board.len(), 1);
        assert_eq!(analysis.speed_lines.len(), 2);
    }
}
