use anyhow::Result;
use serde_json::Value;

use crate::{
    champions::{BaseStats, calculate_stats},
    dex::Dataset,
    schema::{ChampionPoints, Config, FeedbackLevel, ParseResult, ValidationFeedback},
};

const IGNORED_PREFIXES: [&str; 3] = ["ivs", "happiness", "shiny"];

pub fn parse_showdown_text(text: &str, dataset: &Dataset) -> Result<ParseResult> {
    let mut configs = Vec::new();
    let mut feedback = Vec::new();
    for (index, block) in normalize_import_text(text)
        .split("\n\n")
        .map(str::trim)
        .filter(|block| !block.is_empty())
        .enumerate()
    {
        match parse_block(block, index + 1, dataset) {
            Some((config, mut items)) => {
                configs.push(config);
                feedback.append(&mut items);
            }
            None => feedback.push(feedback_item(
                FeedbackLevel::Error,
                "invalid-block",
                index + 1,
                None,
                "",
                "",
                "Invalid Showdown block",
            )),
        }
    }
    let errors = feedback
        .iter()
        .filter(|item| item.level == FeedbackLevel::Error)
        .cloned()
        .collect();
    let warnings = feedback
        .iter()
        .filter(|item| item.level == FeedbackLevel::Warning)
        .cloned()
        .collect();
    Ok(ParseResult {
        configs,
        feedback,
        errors,
        warnings,
    })
}

pub fn export_team_text(configs: &[Config]) -> String {
    configs
        .iter()
        .map(export_config)
        .collect::<Vec<_>>()
        .join("\n\n")
}

fn export_config(config: &Config) -> String {
    let mut lines = Vec::new();
    if config.item.is_empty() {
        lines.push(config.display_name.clone());
    } else {
        lines.push(format!("{} @ {}", config.display_name, config.item));
    }
    if !config.ability.is_empty() {
        lines.push(format!("Ability: {}", config.ability));
    }
    if config.level > 0 {
        lines.push(format!("Level: {}", config.level));
    }
    if !config.tera_type.is_empty() {
        lines.push(format!("Tera Type: {}", config.tera_type));
    }
    lines.push(format_points_line(&config.champion_points));
    if !config.nature.is_empty() {
        lines.push(format!("{} Nature", config.nature));
    }
    lines.extend(config.move_names.iter().map(|name| format!("- {name}")));
    lines.join("\n")
}

fn parse_block(
    block: &str,
    block_index: usize,
    dataset: &Dataset,
) -> Option<(Config, Vec<ValidationFeedback>)> {
    let mut lines = block.lines().map(str::trim).filter(|line| !line.is_empty());
    let first_line = lines.next()?;
    let (species_label, item_label) = parse_header(first_line);
    let species_id = normalize_name(&species_label);
    let species_entry = dataset.pokedex.get(&species_id)?;
    let species_name = string_field(species_entry, "name").unwrap_or(species_label);
    let types = species_entry
        .get("types")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(str::to_owned)
        .collect::<Vec<_>>();
    let base_stats = base_stats(species_entry)?;
    let mut ability = String::new();
    let mut item = canonical_name(&dataset.items, &item_label).unwrap_or(item_label);
    let mut level = 50;
    let mut tera_type = String::new();
    let mut note = String::new();
    let mut nature = String::new();
    let mut champion_points: Option<ChampionPoints> = None;
    let mut move_names = Vec::new();
    let mut feedback = Vec::new();
    for (offset, line) in lines.enumerate() {
        let line_number = offset + 2;
        if let Some(value) = prefixed_value(line, "Ability") {
            ability = canonical_name(&dataset.abilities, value).unwrap_or_else(|| value.to_owned());
        } else if let Some(value) = prefixed_value(line, "Level") {
            level = value.parse::<u8>().unwrap_or(50);
        } else if let Some(value) = prefixed_value(line, "Tera Type") {
            tera_type = value.to_owned();
        } else if let Some(value) = prefixed_value(line, "Note") {
            note = value.to_owned();
        } else if let Some(value) = prefixed_value(line, "Points") {
            champion_points = Some(parse_stat_values(value, false));
        } else if let Some(value) = prefixed_value(line, "EVs") {
            champion_points = Some(parse_stat_values(value, true));
        } else if let Some(value) = line.strip_suffix(" Nature") {
            nature = value.trim().to_owned();
        } else if let Some(value) = line.strip_prefix("- ") {
            let raw_move = value.trim();
            move_names.push(
                canonical_name(&dataset.moves, raw_move).unwrap_or_else(|| raw_move.to_owned()),
            );
        } else {
            let prefix = line
                .split(':')
                .next()
                .map(normalize_name)
                .unwrap_or_default();
            if !IGNORED_PREFIXES.contains(&prefix.as_str()) {
                feedback.push(feedback_item(
                    FeedbackLevel::Warning,
                    "unparsed-line",
                    block_index,
                    Some(line_number),
                    &species_id,
                    &species_name,
                    "Unparsed line",
                ));
            }
        }
    }
    if ability.is_empty() {
        ability = first_ability(species_entry);
    }
    item = empty_falsey_item(item);
    let champion_points = champion_points.unwrap_or_else(default_champion_points);
    let stats = calculate_stats(&base_stats, &champion_points, &nature);
    let config = Config {
        id: format!("{species_id}-{block_index}"),
        species_id: species_id.clone(),
        species_name: species_name.clone(),
        display_name: species_name.clone(),
        note,
        types,
        ability,
        item,
        tera_type,
        nature,
        level,
        champion_points,
        move_names,
        stats,
    };
    Some((config, feedback))
}

fn normalize_import_text(text: &str) -> String {
    text.trim_start_matches('\u{feff}')
        .replace("\r", "")
        .replace('\t', "  ")
}

pub fn normalize_name(text: &str) -> String {
    text.chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

fn parse_header(line: &str) -> (String, String) {
    let (left, right) = line.split_once('@').unwrap_or((line, ""));
    let species = left
        .trim()
        .trim_end_matches(" (M)")
        .trim_end_matches(" (F)")
        .trim()
        .to_owned();
    (species, right.trim().to_owned())
}

fn prefixed_value<'a>(line: &'a str, label: &str) -> Option<&'a str> {
    line.strip_prefix(label)?.strip_prefix(':').map(str::trim)
}

fn canonical_name(map: &std::collections::HashMap<String, Value>, value: &str) -> Option<String> {
    let id = normalize_name(value);
    map.get(&id).and_then(|entry| string_field(entry, "name"))
}

fn string_field(value: &Value, key: &str) -> Option<String> {
    value.get(key).and_then(Value::as_str).map(str::to_owned)
}

fn base_stats(value: &Value) -> Option<BaseStats> {
    let stats = value.get("baseStats")?;
    Some(BaseStats {
        hp: stat_value(stats, "hp"),
        atk: stat_value(stats, "atk"),
        def: stat_value(stats, "def"),
        spa: stat_value(stats, "spa"),
        spd: stat_value(stats, "spd"),
        spe: stat_value(stats, "spe"),
    })
}

fn stat_value(value: &Value, key: &str) -> u16 {
    value.get(key).and_then(Value::as_u64).unwrap_or(0) as u16
}

fn first_ability(value: &Value) -> String {
    value
        .get("abilities")
        .and_then(Value::as_object)
        .and_then(|abilities| {
            abilities
                .get("0")
                .or_else(|| abilities.get("H"))
                .or_else(|| abilities.values().next())
        })
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_owned()
}

fn parse_stat_values(text: &str, from_evs: bool) -> ChampionPoints {
    let mut points = ChampionPoints::default();
    for part in text.split('/') {
        let mut pieces = part.split_whitespace();
        let value = pieces
            .next()
            .and_then(|raw| raw.parse::<u16>().ok())
            .unwrap_or(0);
        let stat = pieces.next().unwrap_or("");
        let normalized = if from_evs {
            ((value + 4) / 8).min(32)
        } else {
            value.min(32)
        };
        match stat {
            "HP" => points.hp = normalized,
            "Atk" => points.atk = normalized,
            "Def" => points.def = normalized,
            "SpA" => points.spa = normalized,
            "SpD" => points.spd = normalized,
            "Spe" => points.spe = normalized,
            _ => {}
        }
    }
    points
}

fn default_champion_points() -> ChampionPoints {
    ChampionPoints {
        hp: 0,
        atk: 32,
        def: 0,
        spa: 32,
        spd: 0,
        spe: 2,
    }
}

fn format_points_line(points: &ChampionPoints) -> String {
    format!(
        "Points: {} HP / {} Atk / {} Def / {} SpA / {} SpD / {} Spe",
        points.hp, points.atk, points.def, points.spa, points.spd, points.spe,
    )
}

fn empty_falsey_item(item: String) -> String {
    match normalize_name(&item).as_str() {
        "nothing" | "noitem" | "none" => String::new(),
        _ => item,
    }
}

fn feedback_item(
    level: FeedbackLevel,
    code: &str,
    block_index: usize,
    line_number: Option<usize>,
    species_id: &str,
    config_name: &str,
    message: &str,
) -> ValidationFeedback {
    ValidationFeedback {
        level,
        code: code.to_owned(),
        block_index,
        line_number,
        species_id: species_id.to_owned(),
        config_name: config_name.to_owned(),
        message: message.to_owned(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dex::Dataset;
    use std::path::Path;

    #[test]
    fn parses_garchomp_showdown_text() {
        let dataset = Dataset::load_from_repo(Path::new("../..")).unwrap();
        let text = r#"Garchomp @ Life Orb
Ability: Rough Skin
Level: 50
Points: 2 HP / 32 Atk / 0 Def / 0 SpA / 0 SpD / 32 Spe
Jolly Nature
- Dragon Claw
- Protect
- Earthquake
- Stomping Tantrum"#;
        let result = parse_showdown_text(text, &dataset).unwrap();
        assert_eq!(result.errors.len(), 0);
        assert_eq!(result.configs.len(), 1);
        let config = &result.configs[0];
        assert_eq!(config.species_id, "garchomp");
        assert_eq!(config.item, "Life Orb");
        assert_eq!(config.ability, "Rough Skin");
        assert_eq!(config.champion_points.atk, 32);
        assert_eq!(config.move_names.len(), 4);
    }
}
