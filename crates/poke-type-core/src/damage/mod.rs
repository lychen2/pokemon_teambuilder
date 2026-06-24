use serde::Serialize;
use serde_json::Value;

use crate::{
    battle::{get_effective_speed, type_multiplier},
    dex::Dataset,
    schema::Config,
    showdown::normalize_name,
};

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DamageSummary {
    pub left_headline: String,
    pub right_headline: String,
    pub left_moves: Vec<MoveDamage>,
    pub right_moves: Vec<MoveDamage>,
    pub attacker_speed: u16,
    pub defender_speed: u16,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MoveDamage {
    pub move_name: String,
    pub damage_text: String,
    pub ko_text: String,
    pub description: String,
    pub min_percent: f64,
    pub max_percent: f64,
    pub damage_rolls: Vec<f64>,
}

#[derive(Debug, Clone)]
struct MoveInfo {
    name: String,
    move_type: String,
    category: String,
    base_power: u16,
    spread: bool,
}

pub fn calculate_damage_pair(
    attacker: &Config,
    defender: &Config,
    dataset: &Dataset,
) -> DamageSummary {
    let left_moves = calculate_moves(attacker, defender, dataset);
    let right_moves = calculate_moves(defender, attacker, dataset);
    let left_headline = left_moves.first().map(headline).unwrap_or_default();
    let right_headline = right_moves.first().map(headline).unwrap_or_default();
    DamageSummary {
        left_headline,
        right_headline,
        left_moves,
        right_moves,
        attacker_speed: get_effective_speed(attacker),
        defender_speed: get_effective_speed(defender),
    }
}

fn calculate_moves(attacker: &Config, defender: &Config, dataset: &Dataset) -> Vec<MoveDamage> {
    attacker
        .move_names
        .iter()
        .map(|move_name| calculate_move(attacker, defender, move_name, dataset))
        .collect()
}

fn calculate_move(
    attacker: &Config,
    defender: &Config,
    move_name: &str,
    dataset: &Dataset,
) -> MoveDamage {
    let Some(info) = move_info(move_name, dataset) else {
        return zero_move(move_name, attacker, defender, "Unknown move.");
    };
    if info.category == "Status" || info.base_power == 0 {
        return zero_move(
            &info.name,
            attacker,
            defender,
            "It's a status move, it won't deal damage.",
        );
    }
    let attack = offensive_stat(attacker, &info);
    let defense = defensive_stat(defender, &info);
    let base_damage =
        (((((2 * attacker.level as u32 / 5 + 2) * info.base_power as u32 * attack as u32)
            / defense.max(1) as u32)
            / 50)
            + 2) as u16;
    let effectiveness = defender
        .types
        .iter()
        .map(|defense_type| type_multiplier(&info.move_type, defense_type))
        .product::<f64>();
    if effectiveness == 0.0 {
        return zero_move(&info.name, attacker, defender, "No effect.");
    }
    let rolls = (85..=100)
        .map(|random| {
            let damage = apply_modifiers(base_damage, random, attacker, &info, effectiveness);
            percent(damage, defender.stats.hp)
        })
        .collect::<Vec<_>>();
    let min_percent = *rolls.first().unwrap_or(&0.0);
    let max_percent = *rolls.last().unwrap_or(&0.0);
    let min_damage = damage_from_percent(min_percent, defender.stats.hp);
    let max_damage = damage_from_percent(max_percent, defender.stats.hp);
    let damage_text = format!(
        "{min_damage}-{max_damage} ({} - {}%)",
        trim_percent(min_percent),
        trim_percent(max_percent)
    );
    let ko_text = ko_text(max_damage, defender.stats.hp);
    let description = format!(
        "{} {} vs. {}",
        attacker.display_name, info.name, defender.display_name
    );
    MoveDamage {
        move_name: info.name,
        damage_text,
        ko_text,
        description,
        min_percent,
        max_percent,
        damage_rolls: rolls,
    }
}

fn apply_modifiers(
    base_damage: u16,
    random: u16,
    attacker: &Config,
    info: &MoveInfo,
    effectiveness: f64,
) -> u16 {
    let mut damage = base_damage as f64;
    damage = (damage * random as f64 / 100.0).floor();
    damage = item_modifier(damage, attacker, info).floor();
    if info.spread {
        damage = (damage * 0.75).floor();
    }
    if attacker
        .types
        .iter()
        .any(|type_name| type_name == &info.move_type)
    {
        damage = (damage * 1.5).floor();
    }
    damage = (damage * effectiveness).floor();
    damage.max(1.0) as u16
}

fn item_modifier(damage: f64, attacker: &Config, info: &MoveInfo) -> f64 {
    match normalize_name(&attacker.item).as_str() {
        "lifeorb" => damage * 1.3,
        "choiceband" if info.category == "Physical" => damage * 1.5,
        "choicespecs" if info.category == "Special" => damage * 1.5,
        _ => damage,
    }
}

fn offensive_stat(config: &Config, info: &MoveInfo) -> u16 {
    if info.category == "Physical" {
        config.stats.atk
    } else {
        config.stats.spa
    }
}

fn defensive_stat(config: &Config, info: &MoveInfo) -> u16 {
    if info.category == "Physical" {
        config.stats.def
    } else {
        config.stats.spd
    }
}

fn move_info(move_name: &str, dataset: &Dataset) -> Option<MoveInfo> {
    let value = dataset.moves.get(&normalize_name(move_name))?;
    Some(MoveInfo {
        name: value
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or(move_name)
            .to_owned(),
        move_type: value
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or("Normal")
            .to_owned(),
        category: value
            .get("category")
            .and_then(Value::as_str)
            .unwrap_or("Status")
            .to_owned(),
        base_power: value.get("basePower").and_then(Value::as_u64).unwrap_or(0) as u16,
        spread: matches!(
            value.get("target").and_then(Value::as_str),
            Some("allAdjacent") | Some("allAdjacentFoes")
        ),
    })
}

fn zero_move(move_name: &str, attacker: &Config, defender: &Config, ko_text: &str) -> MoveDamage {
    MoveDamage {
        move_name: move_name.to_owned(),
        damage_text: "0 (0%)".into(),
        ko_text: ko_text.into(),
        description: format!(
            "{} {} vs. {}",
            attacker.display_name, move_name, defender.display_name
        ),
        min_percent: 0.0,
        max_percent: 0.0,
        damage_rolls: vec![0.0],
    }
}

fn ko_text(max_damage: u16, hp: u16) -> String {
    if max_damage >= hp {
        "guaranteed OHKO".into()
    } else if max_damage.saturating_mul(2) >= hp {
        "possible 2HKO".into()
    } else if max_damage.saturating_mul(3) >= hp {
        "possible 3HKO".into()
    } else {
        "possible 4HKO".into()
    }
}

fn headline(move_damage: &MoveDamage) -> String {
    format!(
        "{}: {} -- {}",
        move_damage.description, move_damage.damage_text, move_damage.ko_text
    )
}

fn percent(damage: u16, hp: u16) -> f64 {
    if hp == 0 {
        return 0.0;
    }
    ((damage as f64 * 1000.0 / hp as f64).round()) / 10.0
}

fn damage_from_percent(percent: f64, hp: u16) -> u16 {
    ((percent / 100.0) * hp as f64).round() as u16
}

fn trim_percent(value: f64) -> String {
    if (value.fract()).abs() < f64::EPSILON {
        format!("{}", value as u16)
    } else {
        format!("{value:.1}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{dex::Dataset, showdown::parse_showdown_text};
    use std::path::Path;

    #[test]
    fn calculates_basic_damage_pair() {
        let dataset = Dataset::load_from_repo(Path::new("../..")).unwrap();
        let text = include_str!("../../../../tests/fixtures/basic-team.txt");
        let parsed = parse_showdown_text(text, &dataset).unwrap();
        let summary = calculate_damage_pair(&parsed.configs[0], &parsed.configs[0], &dataset);
        assert_eq!(summary.attacker_speed, 169);
        assert_eq!(summary.defender_speed, 169);
        assert_eq!(summary.left_moves.len(), 4);
        let dragon_claw = &summary.left_moves[0];
        assert_eq!(dragon_claw.move_name, "Dragon Claw");
        assert!(dragon_claw.min_percent >= 95.0);
        assert!(dragon_claw.max_percent >= 110.0);
        assert_eq!(summary.left_moves[1].damage_rolls, vec![0.0]);
    }
}
