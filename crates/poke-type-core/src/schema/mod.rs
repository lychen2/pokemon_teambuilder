use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ChampionPoints {
    pub hp: u16,
    pub atk: u16,
    pub def: u16,
    pub spa: u16,
    pub spd: u16,
    pub spe: u16,
}

impl Default for ChampionPoints {
    fn default() -> Self {
        Self {
            hp: 0,
            atk: 0,
            def: 0,
            spa: 0,
            spd: 0,
            spe: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
    pub hp: u16,
    pub atk: u16,
    pub def: u16,
    pub spa: u16,
    pub spd: u16,
    pub spe: u16,
}

impl Default for Stats {
    fn default() -> Self {
        Self {
            hp: 0,
            atk: 0,
            def: 0,
            spa: 0,
            spd: 0,
            spe: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub id: String,
    pub species_id: String,
    pub species_name: String,
    pub display_name: String,
    pub note: String,
    pub types: Vec<String>,
    pub ability: String,
    pub item: String,
    pub tera_type: String,
    pub nature: String,
    pub level: u8,
    pub champion_points: ChampionPoints,
    pub move_names: Vec<String>,
    pub stats: Stats,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum FeedbackLevel {
    Error,
    Warning,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ValidationFeedback {
    pub level: FeedbackLevel,
    pub code: String,
    pub block_index: usize,
    pub line_number: Option<usize>,
    pub species_id: String,
    pub config_name: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ParseResult {
    pub configs: Vec<Config>,
    pub feedback: Vec<ValidationFeedback>,
    pub errors: Vec<ValidationFeedback>,
    pub warnings: Vec<ValidationFeedback>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_parse_result_with_errors_and_warnings() {
        let result = ParseResult {
            configs: vec![],
            feedback: vec![ValidationFeedback {
                level: FeedbackLevel::Warning,
                code: "unparsed-line".into(),
                block_index: 1,
                line_number: Some(7),
                species_id: "garchomp".into(),
                config_name: "Garchomp".into(),
                message: "ignored".into(),
            }],
            errors: vec![],
            warnings: vec![],
        };
        let json = serde_json::to_value(&result).unwrap();
        assert_eq!(json["feedback"][0]["blockIndex"], 1);
        assert_eq!(json["feedback"][0]["lineNumber"], 7);
        assert_eq!(json["feedback"][0]["level"], "warning");
    }
}
