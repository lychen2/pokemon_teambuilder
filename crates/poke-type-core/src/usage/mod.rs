use serde::Serialize;
use serde_json::Value;

use crate::{dex::Dataset, schema::ChampionPoints, showdown::normalize_name};

const USAGE_RECORD_LIMIT: usize = 16;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UsageRow {
    pub usage_name: String,
    pub species_id: String,
    pub species_name: String,
    pub localized_name: String,
    pub usage: f64,
    pub rank: u64,
    pub source: String,
    pub sample_weight: f64,
    pub is_available: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UsageDetail {
    #[serde(flatten)]
    pub row: UsageRow,
    pub spreads: Vec<SpreadEntry>,
    pub moves: Vec<RecordEntry>,
    pub items: Vec<RecordEntry>,
    pub abilities: Vec<RecordEntry>,
    pub teammates: Vec<RecordEntry>,
}

impl std::ops::Deref for UsageDetail {
    type Target = UsageRow;

    fn deref(&self) -> &Self::Target {
        &self.row
    }
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RecordEntry {
    pub name: String,
    pub resolved_name: String,
    pub count: f64,
    pub share: f64,
    pub resolved: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SpreadEntry {
    pub label: String,
    pub nature: String,
    pub points: ChampionPoints,
    pub count: f64,
    pub share: f64,
    pub valid_total: bool,
    pub has_nature: bool,
}

pub fn usage_rows(dataset: &Dataset, search: Option<&str>) -> Vec<UsageRow> {
    let needle = search.map(normalize_name).unwrap_or_default();
    let Some(data) = dataset.usage.get("data").and_then(Value::as_object) else {
        return Vec::new();
    };
    let mut rows = data
        .iter()
        .map(|(usage_name, profile)| build_usage_row(dataset, usage_name, profile))
        .filter(|row| {
            needle.is_empty()
                || [
                    row.usage_name.as_str(),
                    row.species_name.as_str(),
                    row.localized_name.as_str(),
                    row.species_id.as_str(),
                ]
                .iter()
                .any(|value| normalize_name(value).contains(&needle))
        })
        .collect::<Vec<_>>();
    rows.sort_by(|left, right| {
        right
            .usage
            .total_cmp(&left.usage)
            .then_with(|| left.localized_name.cmp(&right.localized_name))
    });
    rows
}

pub fn usage_detail(dataset: &Dataset, species_id: &str) -> Option<UsageDetail> {
    let target = normalize_name(species_id);
    let Some(data) = dataset.usage.get("data").and_then(Value::as_object) else {
        return None;
    };
    let (usage_name, profile) = data.iter().find(|(name, _)| {
        resolve_species_id(dataset, name) == target || normalize_name(name) == target
    })?;
    let row = build_usage_row(dataset, usage_name, profile);
    let sample_weight = row.sample_weight;
    Some(UsageDetail {
        row,
        spreads: spread_entries(profile.get("Spreads"), sample_weight),
        moves: record_entries(profile.get("Moves"), sample_weight, |name| {
            resolve_named(&dataset.moves, name)
        }),
        items: record_entries(profile.get("Items"), sample_weight, |name| {
            resolve_named(&dataset.items, name)
        }),
        abilities: record_entries(profile.get("Abilities"), sample_weight, |name| {
            resolve_named(&dataset.abilities, name)
        }),
        teammates: record_entries(profile.get("Teammates"), sample_weight, |name| {
            resolve_species_name(dataset, name)
        }),
    })
}

fn build_usage_row(dataset: &Dataset, usage_name: &str, profile: &Value) -> UsageRow {
    let species_id = resolve_species_id(dataset, usage_name);
    let species = dataset.pokedex.get(&species_id);
    let species_name = species
        .and_then(|value| value.get("name"))
        .and_then(Value::as_str)
        .unwrap_or(usage_name)
        .to_owned();
    let usage = number_field(profile, "usage")
        .or_else(|| number_field(profile, "usageRankScore"))
        .unwrap_or(0.0);
    UsageRow {
        usage_name: usage_name.to_owned(),
        species_id: species_id.clone(),
        species_name: species_name.clone(),
        localized_name: species_name,
        usage,
        rank: number_field(profile, "rank").unwrap_or(0.0) as u64,
        source: "pikalytics".to_owned(),
        sample_weight: estimate_sample_weight(profile),
        is_available: dataset.champions_usable_species.contains(&species_id),
    }
}

fn resolve_species_id(dataset: &Dataset, name: &str) -> String {
    let id = normalize_name(name);
    if dataset.pokedex.contains_key(&id) {
        id
    } else {
        String::new()
    }
}

fn resolve_species_name(dataset: &Dataset, name: &str) -> Option<String> {
    let id = resolve_species_id(dataset, name);
    dataset
        .pokedex
        .get(&id)
        .and_then(|value| value.get("name"))
        .and_then(Value::as_str)
        .map(str::to_owned)
}

fn resolve_named(map: &std::collections::HashMap<String, Value>, name: &str) -> Option<String> {
    map.get(&normalize_name(name))
        .and_then(|value| value.get("name"))
        .and_then(Value::as_str)
        .map(str::to_owned)
}

fn record_entries<F>(record: Option<&Value>, sample_weight: f64, resolver: F) -> Vec<RecordEntry>
where
    F: Fn(&str) -> Option<String>,
{
    let mut entries = record
        .and_then(Value::as_object)
        .into_iter()
        .flatten()
        .filter_map(|(name, value)| {
            let count = value.as_f64().unwrap_or(0.0);
            (count > 0.0).then_some((name, count))
        })
        .collect::<Vec<_>>();
    entries.sort_by(|left, right| right.1.total_cmp(&left.1));
    entries
        .into_iter()
        .take(USAGE_RECORD_LIMIT)
        .map(|(name, count)| {
            let resolved = resolver(name);
            RecordEntry {
                name: name.to_owned(),
                resolved_name: resolved.clone().unwrap_or_else(|| name.to_owned()),
                count,
                share: record_share(count, sample_weight),
                resolved: resolved.is_some(),
            }
        })
        .collect()
}

fn spread_entries(record: Option<&Value>, sample_weight: f64) -> Vec<SpreadEntry> {
    let mut entries = record
        .and_then(Value::as_object)
        .into_iter()
        .flatten()
        .filter_map(|(key, value)| {
            parse_spread_entry(key, value.as_f64().unwrap_or(0.0), sample_weight)
        })
        .collect::<Vec<_>>();
    entries.sort_by(|left, right| right.count.total_cmp(&left.count));
    entries.truncate(USAGE_RECORD_LIMIT);
    entries
}

fn parse_spread_entry(key: &str, count: f64, sample_weight: f64) -> Option<SpreadEntry> {
    let (nature, values) = key.split_once(':')?;
    let numbers = values
        .split('/')
        .map(str::parse::<u16>)
        .collect::<Result<Vec<_>, _>>()
        .ok()?;
    if numbers.len() != 6 {
        return None;
    }
    let points = ChampionPoints {
        hp: numbers[0],
        atk: numbers[1],
        def: numbers[2],
        spa: numbers[3],
        spd: numbers[4],
        spe: numbers[5],
    };
    Some(SpreadEntry {
        label: format!("{} {}", nature, values),
        nature: nature.to_owned(),
        valid_total: crate::champions::point_total(&points)
            == crate::champions::CHAMPION_TOTAL_POINTS,
        has_nature: true,
        points,
        count,
        share: record_share(count, sample_weight),
    })
}

fn estimate_sample_weight(profile: &Value) -> f64 {
    let spread_total = sum_record(profile.get("Spreads"));
    if spread_total > 0.0 {
        return spread_total;
    }
    ["Items", "Abilities", "Natures"]
        .iter()
        .filter_map(|key| profile.get(*key))
        .map(|record| sum_record(Some(record)))
        .fold(1.0, f64::max)
}

fn sum_record(record: Option<&Value>) -> f64 {
    record
        .and_then(Value::as_object)
        .into_iter()
        .flatten()
        .map(|(_, value)| value.as_f64().unwrap_or(0.0))
        .sum()
}

fn record_share(count: f64, sample_weight: f64) -> f64 {
    if sample_weight > 0.0 {
        count / sample_weight
    } else {
        0.0
    }
}

fn number_field(profile: &Value, key: &str) -> Option<f64> {
    profile.get(key).and_then(Value::as_f64)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dex::Dataset;
    use std::path::Path;

    #[test]
    fn returns_garchomp_usage_detail() {
        let dataset = Dataset::load_from_repo(Path::new("../..")).unwrap();
        let detail = usage_detail(&dataset, "garchomp").unwrap();
        assert_eq!(detail.species_id, "garchomp");
        assert!(!detail.moves.is_empty());
        assert!(!detail.items.is_empty());
        assert!(!detail.abilities.is_empty());
        assert!(!detail.spreads.is_empty());
    }

    #[test]
    fn searches_usage_rows_by_species() {
        let dataset = Dataset::load_from_repo(Path::new("../..")).unwrap();
        let rows = usage_rows(&dataset, Some("gar"));
        assert!(rows.iter().any(|row| row.species_id == "garchomp"));
    }
}
