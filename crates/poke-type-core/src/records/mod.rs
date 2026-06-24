use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BattleRecord {
    pub id: String,
    pub team_id: String,
    pub team_label: String,
    pub our_lineup: Vec<String>,
    pub our_lead: Vec<String>,
    pub opponent_team: Vec<String>,
    pub opponent_lineup: Vec<String>,
    pub result: BattleResult,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum BattleResult {
    Win,
    Loss,
    Timeout,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RecordsResponse {
    pub stats: BattleStats,
    pub insights: Vec<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BattleStats {
    pub scope: String,
    pub totals: BattleTotals,
    pub win_rate: f64,
    pub team_rankings: Vec<TeamRanking>,
    pub opponents: Vec<OpponentStats>,
    pub records: Vec<BattleRecord>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BattleTotals {
    pub total: usize,
    pub win: usize,
    pub loss: usize,
    pub timeout: usize,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TeamRanking {
    pub team_id: String,
    pub team_label: String,
    pub total: usize,
    pub wins: usize,
    pub win_rate: f64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OpponentStats {
    pub species_id: String,
    pub appearances: usize,
    pub wins: usize,
    pub appear_rate: f64,
    pub win_rate: f64,
}

pub fn records_response(records: &[BattleRecord], team_id: Option<&str>) -> RecordsResponse {
    let filtered = records
        .iter()
        .filter(|record| team_id.is_none_or(|wanted| record.team_id == wanted))
        .cloned()
        .collect::<Vec<_>>();
    RecordsResponse {
        stats: compute_stats(&filtered, if team_id.is_some() { "team" } else { "global" }),
        insights: Vec::new(),
    }
}

pub fn validate_battle_record(record: &BattleRecord) -> Result<(), &'static str> {
    if record.team_id.is_empty() {
        return Err("INVALID_TEAM");
    }
    if record.our_lineup.len() != 4 {
        return Err("INVALID_LINEUP");
    }
    if record.our_lead.len() != 2 {
        return Err("INVALID_LEAD");
    }
    if record.opponent_team.is_empty() || record.opponent_team.len() > 6 {
        return Err("INVALID_OPPONENT_TEAM");
    }
    if record.opponent_lineup.len() != 4 {
        return Err("INVALID_OPPONENT_LINEUP");
    }
    Ok(())
}

fn compute_stats(records: &[BattleRecord], scope: &str) -> BattleStats {
    let totals = count_results(records);
    let win_rate = safe_rate(totals.win, totals.total);
    BattleStats {
        scope: scope.to_owned(),
        totals,
        win_rate,
        team_rankings: team_rankings(records),
        opponents: opponent_stats(records),
        records: records.to_vec(),
    }
}

fn count_results(records: &[BattleRecord]) -> BattleTotals {
    let mut totals = BattleTotals {
        total: records.len(),
        win: 0,
        loss: 0,
        timeout: 0,
    };
    for record in records {
        match record.result {
            BattleResult::Win => totals.win += 1,
            BattleResult::Loss => totals.loss += 1,
            BattleResult::Timeout => totals.timeout += 1,
        }
    }
    totals
}

fn team_rankings(records: &[BattleRecord]) -> Vec<TeamRanking> {
    let mut by_team: BTreeMap<String, TeamRanking> = BTreeMap::new();
    for record in records {
        let slot = by_team
            .entry(record.team_id.clone())
            .or_insert_with(|| TeamRanking {
                team_id: record.team_id.clone(),
                team_label: if record.team_label.is_empty() {
                    record.team_id.clone()
                } else {
                    record.team_label.clone()
                },
                total: 0,
                wins: 0,
                win_rate: 0.0,
            });
        slot.total += 1;
        if record.result == BattleResult::Win {
            slot.wins += 1;
        }
        slot.win_rate = safe_rate(slot.wins, slot.total);
    }
    let mut out = by_team.into_values().collect::<Vec<_>>();
    out.sort_by(|left, right| right.win_rate.total_cmp(&left.win_rate));
    out
}

fn opponent_stats(records: &[BattleRecord]) -> Vec<OpponentStats> {
    let mut by_species: BTreeMap<String, OpponentStats> = BTreeMap::new();
    for record in records {
        for species_id in &record.opponent_team {
            let slot = by_species
                .entry(species_id.clone())
                .or_insert_with(|| OpponentStats {
                    species_id: species_id.clone(),
                    appearances: 0,
                    wins: 0,
                    appear_rate: 0.0,
                    win_rate: 0.0,
                });
            slot.appearances += 1;
            if record.result == BattleResult::Win {
                slot.wins += 1;
            }
        }
    }
    let total = records.len();
    let mut out = by_species
        .into_values()
        .map(|mut entry| {
            entry.appear_rate = safe_rate(entry.appearances, total);
            entry.win_rate = safe_rate(entry.wins, entry.appearances);
            entry
        })
        .collect::<Vec<_>>();
    out.sort_by(|left, right| right.appearances.cmp(&left.appearances));
    out
}

fn safe_rate(numerator: usize, denominator: usize) -> f64 {
    if denominator == 0 {
        0.0
    } else {
        numerator as f64 / denominator as f64
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn computes_empty_global_stats() {
        let response = records_response(&[], None);
        assert_eq!(response.stats.scope, "global");
        assert_eq!(response.stats.totals.total, 0);
        assert!(response.insights.is_empty());
    }

    #[test]
    fn computes_one_record_win_stats() {
        let record = BattleRecord {
            id: "battle:test".into(),
            team_id: "team-a".into(),
            team_label: "Team A".into(),
            our_lineup: vec![
                "garchomp".into(),
                "sneasler".into(),
                "incineroar".into(),
                "primarina".into(),
            ],
            our_lead: vec!["garchomp".into(), "sneasler".into()],
            opponent_team: vec!["dragonite".into(), "garchomp".into()],
            opponent_lineup: vec![
                "dragonite".into(),
                "garchomp".into(),
                "incineroar".into(),
                "sneasler".into(),
            ],
            result: BattleResult::Win,
        };
        let response = records_response(&[record], Some("team-a"));
        assert_eq!(response.stats.scope, "team");
        assert_eq!(response.stats.totals.total, 1);
        assert_eq!(response.stats.totals.win, 1);
        assert_eq!(response.stats.win_rate, 1.0);
    }
}
